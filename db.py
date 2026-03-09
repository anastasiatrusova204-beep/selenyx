# db.py — работа с базой данных Selenyx
import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import aiosqlite

MOSCOW_TZ = ZoneInfo("Europe/Moscow")
_DATA_DIR = "/data" if os.path.isdir("/data") else os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_DATA_DIR, "selenyx.db")

logger = logging.getLogger(__name__)


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id     INTEGER PRIMARY KEY,
                first_name  TEXT,
                zodiac_sign TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()
        for col, definition in [
            ("last_visit",   "TEXT"),
            ("streak",       "INTEGER DEFAULT 0"),
            ("notify_time",  "TEXT"),
            ("birth_date",   "TEXT"),
            ("birth_time",   "TEXT"),
            ("tier",         "TEXT DEFAULT 'free'"),  # NEW: для Telegram Stars (Шаг 12)
        ]:
            try:
                await db.execute(f"ALTER TABLE users ADD COLUMN {col} {definition}")
                await db.commit()
            except Exception:
                pass  # Колонка уже существует


async def get_user(user_id: int) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def save_user_sign(user_id: int, first_name: str, zodiac_sign: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO users (user_id, first_name, zodiac_sign)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET zodiac_sign = ?, first_name = ?
        """, (user_id, first_name, zodiac_sign, zodiac_sign, first_name))
        await db.commit()


async def get_all_user_ids() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT user_id FROM users") as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


async def get_user_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0


async def update_streak(user_id: int) -> int:
    """Обновляет streak и возвращает актуальное значение."""
    today     = datetime.now(tz=MOSCOW_TZ).date().isoformat()
    yesterday = (datetime.now(tz=MOSCOW_TZ).date() - timedelta(days=1)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT last_visit, streak FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return 0
        last_visit = row["last_visit"]
        streak = row["streak"] or 0
        if last_visit == today:
            return streak
        new_streak = (streak + 1) if last_visit == yesterday else 1
        await db.execute(
            "UPDATE users SET last_visit = ?, streak = ? WHERE user_id = ?",
            (today, new_streak, user_id),
        )
        await db.commit()
        return new_streak


async def save_notify_time(user_id: int, time_str: Optional[str]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET notify_time = ? WHERE user_id = ?",
            (time_str, user_id)
        )
        await db.commit()


async def get_users_with_notify(time_str: str) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE notify_time = ?", (time_str,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def save_birth_data(user_id: int, birth_date: str, birth_time: Optional[str]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET birth_date = ?, birth_time = ? WHERE user_id = ?",
            (birth_date, birth_time, user_id),
        )
        await db.commit()


async def save_user_tier(user_id: int, tier: str) -> None:
    """Сохраняет уровень пользователя: 'free' | 'premium' | 'stars:feature_name'."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET tier = ? WHERE user_id = ?",
            (tier, user_id)
        )
        await db.commit()
