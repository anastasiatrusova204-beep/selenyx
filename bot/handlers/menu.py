# bot/handlers/menu.py
# Обработчики нажатий на кнопки главного меню.
# Когда пользователь нажимает кнопку — Telegram присылает её текст как обычное сообщение.
# Здесь мы ловим эти тексты и вызываем нужные функции.

from datetime import datetime
from aiogram import Router, F
from aiogram.types import Message

from bot.services.astro import get_moon_data, get_daily_energy

router = Router()

WEEKDAYS_RU = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
MONTHS_RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]


@router.message(F.text == "⚡️ Энергия дня")
async def menu_today(message: Message):
    day = get_daily_energy()
    now = datetime.now()
    date_str = f"{now.day} {MONTHS_RU[now.month - 1]}, {WEEKDAYS_RU[now.weekday()]}"
    good_list  = "\n".join(f"· {i}" for i in day["good"])
    avoid_list = "\n".join(f"· {i}" for i in day["avoid"])

    await message.answer(
        f"⚡️ <b>Энергия дня — {date_str}</b>\n\n"
        f"{day['phase_emoji']} {day['phase_name']} в {day['sign_prep']}\n\n"
        f"{day['intro']}\n"
        f"{day['sign_meaning']}\n\n"
        f"<b>Хорошо сегодня:</b>\n{good_list}\n\n"
        f"<b>Лучше отложить:</b>\n{avoid_list}\n\n"
        f"💫 <b>Совет дня:</b>\n{day['tip']}"
    )


@router.message(F.text == "🌙 Луна")
async def menu_moon(message: Message):
    moon = get_moon_data()

    await message.answer(
        f"{moon['phase_emoji']} <b>Луна в {moon['sign_prep']}</b>\n\n"
        f"· Фаза: {moon['phase_name']}\n"
        f"· Лунный день: {moon['lunar_day']}\n\n"
        f"{moon['phase_meaning']}\n\n"
        f"<b>Луна в {moon['sign_nom']} говорит:</b>\n"
        f"{moon['sign_meaning']}"
    )


@router.message(F.text == "ℹ️ О боте")
async def menu_about(message: Message):
    await message.answer(
        "🌙 <b>Selenyx</b> — твой личный космический навигатор.\n\n"
        "Каждый день рассказываю о положении Луны и энергии дня — "
        "просто и понятно, без сложной астрологии.\n\n"
        "Расчёты на основе Swiss Ephemeris — той же системы, "
        "которую используют астрономы NASA.\n\n"
        "Контент носит развлекательный характер и не является "
        "астрологической или иной консультацией."
    )
