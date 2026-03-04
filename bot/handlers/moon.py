# bot/handlers/moon.py
# Команда /moon — показывает реальное положение Луны прямо сейчас.

from datetime import datetime
from zoneinfo import ZoneInfo
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.astro import get_moon_data

MOSCOW_TZ = ZoneInfo("Europe/Moscow")
MONTHS_RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]

router = Router()


@router.message(Command("moon"))
async def handle_moon(message: Message):
    moon = get_moon_data()
    now = datetime.now(tz=MOSCOW_TZ)
    date_str = f"{now.day} {MONTHS_RU[now.month - 1]}"

    await message.answer(
        f"{moon['phase_emoji']} <b>Луна в {moon['sign_prep']}</b> — {date_str}\n\n"
        f"· <b>Фаза:</b> {moon['phase_name']}\n"
        f"· <b>Лунный день:</b> {moon['lunar_day']}\n\n"
        f"{moon['phase_meaning']}\n\n"
        f"<b>Луна в {moon['sign_nom']} говорит:</b>\n"
        f"{moon['sign_meaning']}"
    )
