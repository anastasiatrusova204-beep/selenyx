# Selenyx 🌙

Telegram-бот с ежедневными астрологическими подсказками.
Энергия дня, положение Луны — просто и понятно.

**Бот:** [@Selenyx_mybot](https://t.me/Selenyx_mybot)

## Быстрый старт

```bash
# 1. Установить зависимости
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# 2. Создать .env с токеном
cp .env.example .env
# Открыть .env и вставить токен от @BotFather

# 3. Запустить
pkill -9 -f "bot.py" 2>/dev/null; sleep 6
venv/bin/python3 bot.py > bot.log 2>&1 &
sleep 8 && cat bot.log

# 4. Остановить
pkill -9 -f "bot.py"
```

## Документация проекта

| Файл | Что внутри |
|---|---|
| [PROJECT.md](PROJECT.md) | Паспорт проекта: аудитория, функции, монетизация, риски |
| [PLAN.md](PLAN.md) | Пошаговый план разработки (12 шагов) |
| [RESEARCH.md](RESEARCH.md) | Исследование рынка и конкурентов |
| [KNOWLEDGE.md](KNOWLEDGE.md) | База знаний: 12 знаков Луны, 30 лунных дней, фреймворк |
| [bot_brief.md](bot_brief.md) | ТЗ: UX-поток, архитектура, примеры сообщений, метрики |
| [ЗНАНИЯ.md](ЗНАНИЯ.md) | Глоссарий для пользователя (простым языком) |
| [КАК_ЗАПУСТИТЬ.md](КАК_ЗАПУСТИТЬ.md) | Инструкция запуска для нетехнического пользователя |
| [CLAUDE.md](CLAUDE.md) | Инструкции для Claude (AI-разработчика) |

## Стек

Python 3.9 · aiogram 3.13 · kerykeion · SQLite

## Структура

```
bot.py          — весь бот в одном файле (DB + Astro + Keyboards + Handlers)
selenyx.db      — SQLite база данных
.env            — токен бота (не в git)
requirements.txt
```
