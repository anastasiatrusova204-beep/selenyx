# База знаний — Selenyx (Astrolog)
Создана: 2026-05-15

Проект: Telegram-бот с ежедневными астрологическими подсказками.
Стек: Python 3.9 · aiogram 3.13 · kerykeion · aiosqlite · APScheduler
Хостинг: Beget VPS (bot) + GitHub Pages (Mini App tg-app/)

## Структура
- ARCHITECTURE.md — архитектура системы (создаётся после Discovery)
- decisions/ — ключевые технические решения
- specs/ — спецификации

## Правило
Знания актуальны только если обновляются сразу после изменений.
Builder обновляет после каждой сессии с изменениями кода.
