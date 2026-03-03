# bot/handlers/today.py
# Команда /today — энергия дня на основе положения Луны.

from datetime import datetime
from zoneinfo import ZoneInfo
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

MOSCOW_TZ = ZoneInfo("Europe/Moscow")

from bot.services.astro import get_daily_energy, get_zodiac_tip
from bot.db import get_user

router = Router()

WEEKDAYS_RU = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]


@router.message(Command("today"))
async def handle_today(message: Message):
    day = get_daily_energy()

    now = datetime.now(tz=MOSCOW_TZ)
    date_str = f"{now.day} {['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][now.month - 1]}, {WEEKDAYS_RU[now.weekday()]}"

    good_list = "\n".join(f"· {item}" for item in day["good"])
    avoid_list = "\n".join(f"· {item}" for item in day["avoid"])

    # Персональный совет по знаку пользователя
    user = await get_user(message.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    zodiac_tip = get_zodiac_tip(zodiac_sign, day["phase_name"]) if zodiac_sign else ""
    personal_block = f"\n✨ <b>Твой знак сегодня:</b>\n{zodiac_tip}" if zodiac_tip else ""

    await message.answer(
        f"⚡️ <b>Энергия дня — {date_str}</b>\n\n"
        f"{day['phase_emoji']} {day['phase_name']} в {day['sign_prep']}\n\n"
        f"{day['intro']}\n\n"
        f"{day['sign_meaning']}\n\n"
        f"<b>Хорошо сегодня:</b>\n{good_list}\n\n"
        f"<b>Лучше отложить:</b>\n{avoid_list}\n\n"
        f"💫 <b>Совет дня:</b>\n{day['tip']}"
        f"{personal_block}"
    )
