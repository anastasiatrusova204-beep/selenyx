# Selenyx 🌙

Telegram Mini App + бот с ежедневными астрологическими подсказками.
Энергия дня, положение Луны, нумерология, оракул — просто и понятно.

**Бот:** [@Selenyx_mybot](https://t.me/Selenyx_mybot)
**Mini App:** [t.me/Selenyx_mybot/app](https://t.me/Selenyx_mybot/app)
**GitHub Pages:** [anastasiatrusova204-beep.github.io/selenyx](https://anastasiatrusova204-beep.github.io/selenyx/)

---

## Быстрый старт (локально)

```bash
# 1. Установить зависимости
python3.11 -m venv venv
venv/bin/pip install -r requirements.txt

# 2. Настроить окружение
cp .env.example .env
# Открыть .env и вставить BOT_TOKEN от @BotFather

# 3. Запустить бота
pkill -9 -f "bot.py" 2>/dev/null; sleep 6
venv/bin/python3 bot.py > bot.log 2>&1 &
sleep 8 && cat bot.log

# 4. Остановить
pkill -9 -f "bot.py"
```

---

## Деплой

### Mini App → GitHub Pages

```bash
git subtree split --prefix=tg-app -b tmp && git push origin tmp:gh-pages --force && git branch -D tmp
```

### Бот + API → Railway (текущий хостинг)

```bash
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway up --service selenyx-bot
```

### Бот + API → Beget VPS (планируемый хостинг)

```bash
# Автоматическая установка на VPS:
bash deploy/setup-beget.sh

# Обновление кода после изменений:
bash deploy/update.sh
```

Подробный пошаговый гайд: [MIGRATE-TO-BEGET.md](MIGRATE-TO-BEGET.md)

---

## Стек

| Компонент | Технология |
|-----------|-----------|
| Бот | Python 3.11 · aiogram 3.13.1 |
| Астро-расчёты | kerykeion 4.26.3 (Swiss Ephemeris) |
| База данных | SQLite · aiosqlite 0.20.0 |
| Планировщик | APScheduler 3.10.4 |
| API | aiohttp 3.9.5 |
| Mini App | Vanilla JS SPA (GitHub Pages) |
| Хостинг бота | Railway → Beget VPS |

---

## Структура проекта

```
bot.py              — хендлеры бота, scheduler, main()
api.py              — REST API с HMAC-аутентификацией (порт 8080)
astro.py            — астро-расчёты: get_moon_data, get_natal_chart
data.py             — контентные константы (~1100 строк)
db.py               — функции БД, схема таблиц
requirements.txt
Dockerfile          — сборка для Railway
.env.example        — шаблон переменных окружения

tg-app/             — ★ Mini App (автономный SPA)
  index.html        — разметка
  app.js            — логика и навигация
  data.js           — контент и расчёты
  style.css         — стили и анимации

deploy/             — файлы для деплоя на Beget VPS
  nginx.conf        — конфиг nginx (reverse proxy + SSL)
  selenyx.service   — systemd-сервис (автозапуск)
  setup-beget.sh    — автоматическая установка на VPS
  update.sh         — обновление кода и перезапуск
  backup.sh         — резервное копирование БД

landing/            — лендинг (HTML, не задеплоен)
```

---

## Документация

| Файл | Что внутри |
|------|-----------|
| [STATUS.md](STATUS.md) | **Текущий статус** — открывать первым в каждой сессии |
| [MIGRATE-TO-BEGET.md](MIGRATE-TO-BEGET.md) | Пошаговая миграция Railway → Beget VPS |
| [VISUAL-PLAN.md](VISUAL-PLAN.md) | Plan визуальных улучшений (6 шагов) |
| [RETENTION.md](RETENTION.md) | Стратегия удержания пользователей |
| [PROJECT.md](PROJECT.md) | Бизнес-паспорт: аудитория, монетизация, конкуренты |
| [RESEARCH.md](RESEARCH.md) | Конкурентный анализ и исследование рынка |
| [KNOWLEDGE.md](KNOWLEDGE.md) | База знаний: 12 знаков Луны, 30 лунных дней |
| [ЗНАНИЯ.md](ЗНАНИЯ.md) | Глоссарий для пользователей |
| [bot_brief.md](bot_brief.md) | Главное ТЗ (3 эксперта, UX-потоки, архитектура) |
| [BETA_TEST.md](BETA_TEST.md) | Инструкция для тестировщиков |
| [TESTING.md](TESTING.md) | QA-гайд для разработчиков |
| [CLAUDE.md](CLAUDE.md) | Инструкции для Claude (команды, деплой, структура) |
| [tg-app/CLAUDE.md](tg-app/CLAUDE.md) | Документация Mini App для Claude |
