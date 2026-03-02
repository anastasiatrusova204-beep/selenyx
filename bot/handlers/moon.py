# bot/handlers/moon.py
# Команда /moon — показывает реальное положение Луны прямо сейчас.

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.astro import get_moon_data

router = Router()


@router.message(Command("moon"))
async def handle_moon(message: Message):
    moon = get_moon_data()

    await message.answer(
        f"{moon['phase_emoji']} <b>Луна в {moon['sign_prep']}</b>\n\n"
        f"· <b>Фаза:</b> {moon['phase_name']}\n"
        f"· <b>Лунный день:</b> {moon['lunar_day']}\n\n"
        f"{moon['phase_meaning']}\n\n"
        f"<b>Луна в {moon['sign_nom']} говорит:</b>\n"
        f"{moon['sign_meaning']}"
    )
