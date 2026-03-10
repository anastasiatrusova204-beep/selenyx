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

# Единственное соединение на весь процесс — открывается в init_db().
# aiosqlite сериализует операции внутри, asyncio.Lock не нужен.
_db: Optional[aiosqlite.Connection] = None


async def init_db() -> None:
    global _db
    _db = await aiosqlite.connect(DB_PATH)
    _db.row_factory = aiosqlite.Row
    # WAL-режим: параллельные чтения не блокируют запись
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id     INTEGER PRIMARY KEY,
            first_name  TEXT,
            zodiac_sign TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await _db.commit()
    for col, definition in [
        ("last_visit",   "TEXT"),
        ("streak",       "INTEGER DEFAULT 0"),
        ("notify_time",  "TEXT"),
        ("birth_date",   "TEXT"),
        ("birth_time",   "TEXT"),
        ("tier",         "TEXT DEFAULT 'free'"),  # для Telegram Stars (Шаг 12)
        ("trial_start",  "TEXT"),                  # дата начала 7-дневного пробного доступа
    ]:
        try:
            await _db.execute(f"ALTER TABLE users ADD COLUMN {col} {definition}")
            await _db.commit()
        except Exception as e:
            if "duplicate column name" not in str(e).lower():
                logger.warning(f"Миграция БД: неожиданная ошибка при добавлении {col}: {e}")
    # Индекс для ежеминутного запроса планировщика уведомлений
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_notify ON users(notify_time)"
    )
    # Таблица событий для аналитики воронки
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS event_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            event      TEXT NOT NULL,
            data       TEXT,
            ts         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_user ON event_log(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_ts ON event_log(ts)"
    )
    await _db.commit()


async def get_user(user_id: int) -> Optional[dict]:
    async with _db.execute(
        "SELECT * FROM users WHERE user_id = ?", (user_id,)
    ) as cursor:
        row = await cursor.fetchone()
        return dict(row) if row else None


async def ensure_user_exists(user_id: int, first_name: str) -> None:
    """Создаёт запись пользователя если не существует (не перезаписывает данные)."""
    await _db.execute(
        "INSERT OR IGNORE INTO users (user_id, first_name) VALUES (?, ?)",
        (user_id, first_name),
    )
    await _db.commit()


async def save_user_sign(user_id: int, first_name: str, zodiac_sign: str) -> None:
    await _db.execute("""
        INSERT INTO users (user_id, first_name, zodiac_sign)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET zodiac_sign = ?, first_name = ?
    """, (user_id, first_name, zodiac_sign, zodiac_sign, first_name))
    await _db.commit()


async def get_all_user_ids() -> list:
    async with _db.execute("SELECT user_id FROM users") as cursor:
        rows = await cursor.fetchall()
        return [row[0] for row in rows]


async def get_user_count() -> int:
    async with _db.execute("SELECT COUNT(*) FROM users") as cursor:
        row = await cursor.fetchone()
        return row[0] if row else 0


async def update_streak(user_id: int) -> int:
    """Обновляет streak и возвращает актуальное значение."""
    today     = datetime.now(tz=MOSCOW_TZ).date().isoformat()
    yesterday = (datetime.now(tz=MOSCOW_TZ).date() - timedelta(days=1)).isoformat()
    async with _db.execute(
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
    await _db.execute(
        "UPDATE users SET last_visit = ?, streak = ? WHERE user_id = ?",
        (today, new_streak, user_id),
    )
    await _db.commit()
    return new_streak


async def save_notify_time(user_id: int, time_str: Optional[str]) -> None:
    await _db.execute(
        "UPDATE users SET notify_time = ? WHERE user_id = ?",
        (time_str, user_id)
    )
    await _db.commit()


async def get_users_with_notify(time_str: str) -> list:
    async with _db.execute(
        "SELECT * FROM users WHERE notify_time = ?", (time_str,)
    ) as cursor:
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def save_birth_data(user_id: int, birth_date: str, birth_time: Optional[str]) -> None:
    await _db.execute(
        "UPDATE users SET birth_date = ?, birth_time = ? WHERE user_id = ?",
        (birth_date, birth_time, user_id),
    )
    await _db.commit()


async def save_user_tier(user_id: int, tier: str) -> None:
    """Сохраняет уровень пользователя: 'free' | 'premium' | 'stars:feature_name'."""
    await _db.execute(
        "UPDATE users SET tier = ? WHERE user_id = ?",
        (tier, user_id)
    )
    await _db.commit()


async def start_trial(user_id: int) -> None:
    """Запускает 7-дневный пробный период (только если trial_start ещё не задан)."""
    await _db.execute(
        "UPDATE users SET trial_start = datetime('now') WHERE user_id = ? AND trial_start IS NULL",
        (user_id,)
    )
    await _db.commit()


async def get_trial_days_left(user_id: int) -> int:
    """Возвращает количество оставшихся дней пробного периода (0 = истёк, -1 = нет данных)."""
    user = await get_user(user_id)
    if not user or not user.get("trial_start"):
        return -1
    try:
        from datetime import datetime, timezone
        start = datetime.fromisoformat(user["trial_start"].replace(" ", "T"))
        start = start.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - start).days
        return max(0, 7 - elapsed)
    except Exception:
        return -1


async def log_event(user_id: int, event: str, data: Optional[str] = None) -> None:
    """Записывает событие в event_log для аналитики воронки.

    Ключевые события:
      app_open       — открытие Mini App
      today_view     — просмотр вкладки «Мой день»
      domain_tap     — тап на пилюлю домена (data = 'health'|'work'|'love'|'psych')
      prediction_open — открытие личного предсказания
      moon_view      — просмотр вкладки «Луна»
      natal_view     — просмотр вкладки «Карта»
      natal_submit   — ввод даты рождения
      compat_view    — просмотр вкладки «Совместимость»
      compat_check   — проверка совместимости (data = знак партнёра)
      sign_set       — выбор/смена знака
      notify_set     — настройка уведомлений
    """
    try:
        await _db.execute(
            "INSERT INTO event_log (user_id, event, data) VALUES (?, ?, ?)",
            (user_id, event, data),
        )
        await _db.commit()
    except Exception as e:
        logger.warning(f"log_event failed: {e}")


async def get_stats() -> dict:
    """Возвращает базовую статистику для /api/admin/stats."""
    stats: dict = {}
    queries = {
        "total_users":    "SELECT COUNT(*) FROM users",
        "with_sign":      "SELECT COUNT(*) FROM users WHERE zodiac_sign IS NOT NULL",
        "with_notify":    "SELECT COUNT(*) FROM users WHERE notify_time IS NOT NULL",
        "with_birth":     "SELECT COUNT(*) FROM users WHERE birth_date IS NOT NULL",
        "active_7d":      "SELECT COUNT(DISTINCT user_id) FROM event_log WHERE ts >= datetime('now', '-7 days')",
        "active_1d":      "SELECT COUNT(DISTINCT user_id) FROM event_log WHERE ts >= datetime('now', '-1 day')",
        "today_views_7d": "SELECT COUNT(*) FROM event_log WHERE event='today_view' AND ts >= datetime('now', '-7 days')",
        "pred_opens_7d":  "SELECT COUNT(*) FROM event_log WHERE event='prediction_open' AND ts >= datetime('now', '-7 days')",
    }
    for key, sql in queries.items():
        async with _db.execute(sql) as cur:
            row = await cur.fetchone()
            stats[key] = row[0] if row else 0
    return stats
