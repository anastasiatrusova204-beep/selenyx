# CLAUDE.md — инструкции для Claude

## О проекте
Selenyx — Telegram-бот с ежедневными астрологическими подсказками (энергия дня, положение Луны).
Аудитория: женщины и мужчины 20–45 лет, Россия и СНГ. Бюджет MVP: 5 000 ₽.

## Стиль общения
- Всегда отвечать на **русском языке**
- Объяснять как для новичка — просто, без терминологии
- Делать всё самому, не перекладывать на пользователя если возможно
- Ответы короткие и конкретные

## Как запустить бота локально
```bash
# Убить старый процесс и запустить заново (sleep 6 обязателен — TelegramConflictError)
pkill -9 -f "bot.py" 2>/dev/null; sleep 6
venv/bin/python3 bot.py > bot.log 2>&1 &
sleep 8 && cat bot.log
```

## Как задеплоить на Railway
```bash
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway up --service selenyx-bot
```

## Откат на Railway (если деплой сломал что-то)
1. Открыть https://railway.com/project/f53049ff-7cb8-43a4-bffd-d6dc455ec19a
2. Сервис selenyx-bot → Deployments → найти последний рабочий → «Redeploy»
3. Или через CLI: `~/bin/railway rollback --service selenyx-bot` (откатывает на предыдущий деплой)

## DEMO_MODE — тестирование Mini App в браузере
Mini App в браузере вне Telegram не проходит HMAC-аутентификацию → 401.
Чтобы открыть Mini App в браузере без Telegram:
```bash
# Добавить переменную на Railway (временно):
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway variables set DEMO_MODE=true --service selenyx-bot
# После тестирования — отключить:
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway variables set DEMO_MODE=false --service selenyx-bot
```
В DEMO_MODE user = {id: 999999999, first_name: "Демо"} — реальных данных нет.

## Как посмотреть аналитику (воронку)
```bash
# Статистика через API (нужен Telegram initData пользователя из ADMIN_IDS)
# Или напрямую через SQLite на Railway:
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway shell --service selenyx-bot
# Внутри контейнера:
sqlite3 /data/selenyx.db "SELECT event, COUNT(*) FROM event_log GROUP BY event ORDER BY 2 DESC;"
sqlite3 /data/selenyx.db "SELECT COUNT(DISTINCT user_id) FROM event_log WHERE ts >= datetime('now','-7 days');"
```

## Как остановить бота
```bash
pkill -9 -f "bot.py"
```

## Стек
- Python 3.9.6
- aiogram 3.13.1 — фреймворк бота
- kerykeion 4.26.3 — астро-расчёты (Swiss Ephemeris)
- aiosqlite 0.20.0 — база данных
- APScheduler 3.10.4 — планировщик уведомлений
- python-dotenv 1.0.1
- zoneinfo (стандартная библиотека) — часовой пояс Europe/Moscow
- venv в папке проекта: `venv/bin/python3`

## Структура
```
bot.py           — хендлеры бота + scheduler + main()
data.py          — все контентные константы (~1044 строк)
astro.py         — астро-расчёты: get_moon_data, get_natal_chart, etc.
db.py            — функции БД + таблицы users + event_log (аналитика)
api.py           — aiohttp REST API + HMAC-аутентификация (бэкенд для будущих интеграций)
tg-app/          — ★ АКТУАЛЬНОЕ Mini App (автономный SPA, GitHub Pages)
  index.html     — разметка SPA
  app.js         — вся логика: экраны, анимации, данные
  data.js        — контентные данные (знаки, фазы, нумерология, совместимость)
  style.css      — стили
webapp/          — УСТАРЕВШИЙ SPA (Railway, не используется пользователями)
  index.html     — старая версия с API-вызовами (оставлен для совместимости)
.env             — токен BOT_TOKEN и ADMIN_IDS (не коммитить!)
.env.example     — шаблон переменных окружения
selenyx.db       — SQLite база данных (создаётся автоматически, на Railway в /data/)
requirements.txt — зависимости
Dockerfile       — сборка для Railway (python:3.11-slim + libsqlite3)
railway.toml     — конфиг Railway (builder=dockerfile)
```

## Деплой

### Приложение (tg-app/) → GitHub Pages
```bash
git subtree split --prefix=tg-app -b tmp && git push origin tmp:gh-pages --force && git branch -D tmp
```
URL: https://anastasiatrusova204-beep.github.io/selenyx/

### Бот + API → Railway
```bash
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway up --service selenyx-bot
```

## Mini App (tg-app/ — актуальная версия)
- **Прямая ссылка:** https://t.me/Selenyx_mybot/app (зарегистрировано в BotFather, short name: app)
- **Деплой:** GitHub Pages → https://anastasiatrusova204-beep.github.io/selenyx/
- **Тип:** автономный SPA — не делает API-вызовов, все данные в data.js
- **Вход 1 (существующие):** синяя кнопка меню «Selenyx» в чате бота
- **Вход 2 (новые):** прямая ссылка https://t.me/Selenyx_mybot/app — открывает сразу без /start
- Поток первый визит: сплэш → онбординг знака → главный экран → вкладки
- Поток повторный: сплэш → главный экран → вкладки
- Вкладки: День / Луна / Карта / Пара / Оракул
- Домены (Здоровье / Работа / Любовь / Эмоции) → bottom sheet с деталями
- Цвет дня, Число дня → bottom sheet
- Шрифты: Cormorant Garamond + DM Sans
- BackButton Telegram: закрывает bottom sheet или возвращает к выбору знака
- sessionStorage кэш: ключ с датой + версией (_V='v2')
- /resetme команда: пользователь удаляет свои данные (самосервис)

## API эндпоинты (api.py)
```
GET  /health              → "ok"
GET  /webapp              → старый index.html (устаревший, не используется)
GET  /api/me              → {name, sign, streak, notify_time, has_birth, tier, trial_ends}  + log: app_open
GET  /api/today           → {moon, phase_energy, domains, prediction, extras, color}  + log: today_view
GET  /api/moon            → {phase, sign, degree, lunar_day, aspects, retrogrades}  + log: moon_view
GET  /api/moon/calendar   → {text: ...}
GET  /api/natal           → {has_data, sun, moon, asc}  + log: natal_view
POST /api/natal           → body:{birth_date, birth_time}  + log: natal_submit
GET  /api/compat?sign=leo → {rating, title, text, user_sign, target_sign}  + log: compat_check
POST /api/notify          → body:{time}  + log: notify_set
POST /api/sign            → body:{sign}  + log: sign_set
GET  /api/admin/stats     → {total_users, active_7d, active_1d, today_views_7d, ...}  (только ADMIN_IDS)
```

## Статус разработки (план в PLAN.md)
- [x] Шаг 1–5 — бот, онбординг, /moon, /today, меню
- [x] Шаг 5.5 — UX: вкладки, fortune cookie full-screen, прогрессивное раскрытие
- [x] Шаг 6.5 — персонализация: 96 предсказаний + 192 пункта вкладок
- [x] Шаг 10.7 — 4 домена по знаку Луны + лунные дни + аспекты
- [x] Шаг 6 — деплой на Railway ✅
- [x] Шаг 8 — утренние уведомления (APScheduler, выбор времени 07–11)
- [x] Шаг 7.5 — нумерология дня + число судьбы + личный год
- [x] Шаг 7.7 — цвет дня (по планете дня + знаку Луны)
- [x] Шаг 10 — лунный календарь (переходы фаз на 30 дней)
- [x] Шаг 10.5 — совместимость знаков (11 комбинаций по элементам)
- [x] Шаг 10.6 — ретроградные планеты (5 планет, показ в «Мой день»)
- [x] Шаг 11 — натальная карта (Солнце + Луна + Асцендент)
- [x] FAQ + Словарь в «О боте» (6 терминов, 6 вопросов)
- [x] UX-сессия (март 2026) — карусель онбординга, scroll-reveal, tile-row 2×2, trial countdown, /resetme
- [x] Виральность в совместимости — кнопка «Поделиться» (t.me/share/url)
- [x] Итог недели — _weekly_summary_text() при streak кратном 7
- [x] tg-app/ — новый автономный Mini App (GitHub Pages), все кнопки в боте → GitHub Pages
- [ ] Шаг 7 — закрытый тест с реальными пользователями **(СЛЕДУЮЩИЙ)**
- [ ] Шаг 12 — монетизация (Telegram Stars)

## Главное меню (актуальное)
```
      ✨ Мой день
📅 Календарь    🔔 Уведомления
🌟 Моя карта    💞 Совместимость
✏️ Сменить знак  ℹ️ О боте
```

## Вкладки «Мой день»
```
🏥 Здоровье  |  💼 Работа
❤️ Отношения  |  🧠 Психология
┌──────────────────────────────┐  ← tile-row 2×2 (фаза + знак Луны)
│ 🌙 Фаза  │  🌙 Луна         │
└──────────────────────────────┘
🎨 Цвет дня   🔢 Число   (карточки ниже домена)
🥠 Предсказание дня  (отдельный full-screen экран)
```

## Ключевые константы в data.py
- `LUNAR_DAYS` — 30 лунных дней × {symbol, energy, practice}
- `MOON_ASPECT_HINTS` — 25 аспектов (5 планет × 5 видов)
- `PHASE_ENERGY` — 8 фаз × {intro, good, avoid, tip}
- `ZODIAC_PHASE_TIPS` — 96 предсказаний (12 знаков × 8 фаз)
- `ZODIAC_PHASE_EXTRAS` — 192 пункта вкладок (12 × 8 × good/avoid)
- `MOON_SIGN_DOMAINS` — 48 блоков (12 знаков × 4 домена)
- `PHASE_DOMAIN_CONTEXT` — 32 контекста (8 фаз × 4 домена)
- `NUMEROLOGY_DAY` — 9 чисел дня
- `NUMEROLOGY_LIFE_PATH` — 9 чисел судьбы
- `NUMEROLOGY_PERSONAL_YEAR` — 9 чисел личного года
- `_COMPAT_TABLE` — 11 комбинаций совместимости по элементам
- `_RETRO_HINTS` — 5 планет × {emoji, name, hint}
- `SUN_SIGN_DESC`, `MOON_SIGN_DESC`, `ASC_SIGN_DESC` — 36 описаний для натальной карты

## DB-схема (users)
user_id, first_name, zodiac_sign, created_at, last_visit, streak, notify_time, birth_date, birth_time, tier

## Railway Volume
- DB_PATH автоопределяется: `/data/selenyx.db` на Railway, рядом с bot.py локально
- Volume ID: 649e23c5, примонтирован в /data

## Форматирование сообщений бота
- HTML-разметка (ParseMode.HTML настроен в bot.py)
- `<b>текст</b>` — жирный заголовок
- `<tg-spoiler>текст</tg-spoiler>` — скрытый текст (fortune cookie, личный год)
- Эмодзи как иконки пунктов, не как декор заголовков
- Один эмодзи на экран в заголовке, не повторять
- Никакой длинной линии `━━━━━━━━━` — вместо неё пустая строка
- Тон: тёплый, поддерживающий. Не «предсказывает» — «помогает понять ритм дня»

## Важные файлы документации
- PROJECT.md — паспорт проекта (аудитория, функции, монетизация)
- RESEARCH.md — исследование рынка (конкуренты, технологии, цены)
- PLAN.md — пошаговый план разработки (12 шагов)
- KNOWLEDGE.md — база знаний для контента (12 знаков Луны, 30 лунных дней)
- ЗНАНИЯ.md — глоссарий для пользователей (без технической терминологии)
- bot_brief.md — полное ТЗ по методологии трёх экспертов

## Инсайты из UX-экспертизы (март 2026)
- Главная проблема retention: на 7-й день нет нового крючка → нужен «итог недели»
- Виральность не встроена: совместимость показывается, но не шарится
- Пользователь не видит прогресса — нужна статистика использования
- Меню перегружено — рассмотреть сокращение до 4–5 кнопок
- Оффер через боль/результат, не через «астрологию»

## Что НЕ делать
- Не добавлять платную подписку до набора 100+ активных пользователей
- Не усложнять: если можно проще — делать проще
- Не коммитить .env — токен бота там
