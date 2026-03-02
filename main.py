# main.py — точка входа. Отсюда запускается весь бот.

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from config import BOT_TOKEN
from bot.handlers import start, today, moon, menu
from bot.db import init_db

# Настраиваем логи — будем видеть в терминале что происходит с ботом
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    # Создаём таблицы в базе данных если их ещё нет
    await init_db()

    # Bot — объект бота. Передаём токен и настройки по умолчанию.
    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    # Dispatcher — "диспетчер": получает обновления от Telegram и раздаёт обработчикам
    dp = Dispatcher()

    # Подключаем роутер из handlers/start.py
    # Так мы можем держать обработчики в разных файлах — удобно
    dp.include_router(menu.router)   # меню — первым, чтобы кнопки перехватывались до команд
    dp.include_router(start.router)
    dp.include_router(today.router)
    dp.include_router(moon.router)

    logger.info("Бот запущен. Нажми Ctrl+C для остановки.")

    # start_polling — бот постоянно спрашивает Telegram: "есть новые сообщения?"
    # drop_pending_updates=True — игнорируем сообщения, которые пришли пока бот не работал
    await dp.start_polling(bot, drop_pending_updates=True)


if __name__ == "__main__":
    # asyncio.run() запускает асинхронную функцию main()
    # aiogram работает асинхронно — это значит бот может обслуживать много пользователей одновременно
    asyncio.run(main())
