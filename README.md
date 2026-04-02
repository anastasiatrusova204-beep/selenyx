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

### Mini App → GitHub Pages (кнопка в боте)

```bash
git subtree split --prefix=tg-app -b tmp && git push origin tmp:gh-pages --force && git branch -D tmp
```

URL: https://anastasiatrusova204-beep.github.io/selenyx/

### Бот + API → Beget VPS (текущий хостинг)

```bash
# Подключиться к серверу:
ssh root@45.9.43.149   # пароль в .env.secrets

# Обновить код на сервере:
cd /home/selenyx/app && git pull
systemctl restart selenyx

# Проверить статус:
systemctl status selenyx
curl http://45.9.43.149/health

# Логи:
journalctl -u selenyx -f
```

Подробный гайд: [MIGRATE-TO-BEGET.md](MIGRATE-TO-BEGET.md)

### Лендинг → Beget VPS

```bash
ssh root@45.9.43.149
cd /home/selenyx/app && git pull
cp -r landing/* /home/selenyx/landing/
```

### Mini App → Beget VPS

```bash
ssh root@45.9.43.149
cd /home/selenyx/app && git pull
cp -r tg-app/* /home/selenyx/miniapp/
```

---

## Стек

| Компонент | Технология |
|-----------|-----------|
| Бот | Python 3.11 · aiogram 3.13.1 |
| Астро-расчёты | kerykeion 4.26.3 (Swiss Ephemeris) |
| База данных | SQLite · aiosqlite 0.20.0 |
| Планировщик | APScheduler 3.10.4 |
| API | aiohttp 3.9.5 |
| Mini App | Vanilla JS SPA (GitHub Pages + Beget VPS) |
| Хостинг бота | Beget VPS (45.9.43.149) |
| Лендинг | Beget VPS → selenyx.ru (домен ожидает DNS) |

---

## Структура проекта

```
bot.py              — хендлеры бота, scheduler, main()
api.py              — REST API с HMAC-аутентификацией (порт 8080)
astro.py            — астро-расчёты: get_moon_data, get_natal_chart
data.py             — контентные константы (~1100 строк)
db.py               — функции БД, схема таблиц
requirements.txt
Dockerfile          — Docker-образ для сборки
.env.example        — шаблон переменных окружения

tg-app/             — ★ Mini App (автономный SPA)
  index.html        — разметка
  app.js            — логика и навигация
  data.js           — контент и расчёты
  style.css         — стили и анимации
  CLAUDE.md         — документация компонентов Mini App

landing/            — лендинг-витрина (selenyx.ru)
  index.html        — полный лендинг (задеплоен на Beget)
  style.css         — стили лендинга
  app.js            — интерактивный выбор знака

deploy/             — конфиги сервера Beget VPS
  nginx.conf        — конфиг nginx (reverse proxy, HTTP + SSL-секция)
  selenyx.service   — systemd-сервис (автозапуск бота)
  setup-beget.sh    — скрипт первичной установки на VPS
  update.sh         — обновление кода и перезапуск бота
  backup.sh         — резервное копирование БД (cron 03:00)
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
