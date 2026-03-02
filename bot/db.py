# bot/db.py
# Работа с базой данных SQLite.
# SQLite — это файловая база данных, она хранится прямо в папке проекта.
# Нам нужно помнить одно: знак зодиака каждого пользователя.

import os
from typing import Optional
import aiosqlite

# Путь к файлу базы данных — будет создан автоматически рядом с main.py
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "selenyx.db")


async def init_db():
    """Создаём таблицу users при первом запуске бота."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id    INTEGER PRIMARY KEY,
                first_name TEXT,
                zodiac_sign TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


async def get_user(user_id: int) -> Optional[dict]:
    """Найти пользователя по его Telegram ID. Вернёт None если не найден."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def save_user_sign(user_id: int, first_name: str, zodiac_sign: str):
    """Сохранить или обновить знак зодиака пользователя."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO users (user_id, first_name, zodiac_sign)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET zodiac_sign = ?, first_name = ?
        """, (user_id, first_name, zodiac_sign, zodiac_sign, first_name))
        await db.commit()
