# Selenyx 🌙

Telegram Mini App + бот с ежедневными астрологическими подсказками.
Энергия дня, положение Луны, нумерология, оракул — просто и понятно.

**Бот:** [@Selenyx_mybot](https://t.me/Selenyx_mybot)  
**Mini App:** [t.me/Selenyx_mybot/app](https://t.me/Selenyx_mybot/app)  
**GitHub Pages:** [anastasiatrusova204-beep.github.io/selenyx](https://anastasiatrusova204-beep.github.io/selenyx/)

---

## Быстрый старт (локально)

```bash
python3.11 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env
# Вставить BOT_TOKEN в .env

pkill -9 -f "bot.py" 2>/dev/null; sleep 6
venv/bin/python3 bot.py > bot.log 2>&1 &
sleep 8 && cat bot.log
```

---

## Деплой

### Mini App → GitHub Pages (кнопка в боте)

```bash
git subtree split --prefix=tg-app -b tmp && git push origin tmp:gh-pages --force && git branch -D tmp
```

### Бот → Beget VPS

```bash
# Обновить код (через expect — пароль в CLAUDE.md):
bash /home/selenyx/app/deploy/update.sh
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
| Mini App | Vanilla JS SPA (GitHub Pages) |
| Хостинг бота | Beget VPS (45.9.43.149) |

---

## Структура проекта

```
bot.py              — хендлеры бота, scheduler, main()
api.py              — REST API с HMAC-аутентификацией (порт 8080)
astro.py            — астро-расчёты: get_moon_data, get_natal_chart
data.py             — контентные константы (~1100 строк)
db.py               — функции БД, схема таблиц
requirements.txt
Dockerfile
.env.example

tg-app/             — ★ Mini App (автономный SPA, GitHub Pages)
  index.html        — разметка
  app.js            — логика и навигация (v=51)
  data.js           — контент и расчёты (v=17)
  style.css         — стили и анимации (v=33)
  CLAUDE.md         — документация компонентов

landing/            — лендинг-витрина (http://45.9.43.149)
  index.html

deploy/             — конфиги Beget VPS
  nginx.conf
  selenyx.service
  update.sh         — обновление кода и перезапуск бота
  backup.sh         — резервное копирование БД
  setup-beget.sh    — первичная установка на VPS
```

---

## Документация

| Файл | Что внутри |
|------|-----------|
| [STATUS.md](STATUS.md) | **Текущий статус** — открывать первым в каждой сессии |
| [CLAUDE.md](CLAUDE.md) | Инструкции для Claude: команды, деплой, SSH |
| [BETA_TEST.md](BETA_TEST.md) | Сценарии теста + шпаргалка рассылки |
| [RETENTION.md](RETENTION.md) | Стратегия удержания и вовлечения |
| [PROJECT.md](PROJECT.md) | Бизнес-паспорт: аудитория, монетизация |
| [RESEARCH.md](RESEARCH.md) | Конкурентный анализ, ценообразование |
| [KNOWLEDGE.md](KNOWLEDGE.md) | Контентная база: 12 знаков Луны, 30 лунных дней |
| [ЗНАНИЯ.md](ЗНАНИЯ.md) | Глоссарий для пользователей |
| [DIAGNOSTICS.md](DIAGNOSTICS.md) | Концепция психологической диагностики (Шаг 13) |
| [VISUAL-PLAN.md](VISUAL-PLAN.md) | Визуальные улучшения (все 6 шагов ✅) |
