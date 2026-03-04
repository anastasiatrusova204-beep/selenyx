# bot/handlers/menu.py
# Обработчики кнопок главного меню.
# ✨ Мой день — объединяет энергию дня и лунный контекст.

from aiogram import Router, F
from aiogram.types import Message, CallbackQuery

from bot.services.astro import get_daily_energy, get_zodiac_tip, get_zodiac_extras
from bot.keyboards.menus import zodiac_keyboard, energy_tabs_keyboard, energy_detail_keyboard
from bot.db import get_user

router = Router()


# ── Мой день ─────────────────────────────────────────────────────────────────

def _my_day_text() -> tuple:
    """Текст и клавиатура экрана Мой день."""
    day = get_daily_energy()
    text = (
        f"✨ <b>Мой день</b>\n\n"
        f"{day['intro']}\n\n"
        f"· {day['phase_emoji']} Луна в {day['sign_nom']} · {day['lunar_day']} лунный день\n\n"
        f"💫 <b>Совет дня:</b>\n{day['tip']}"
    )
    return text, energy_tabs_keyboard()


@router.message(F.text == "✨ Мой день")
async def menu_my_day(message: Message):
    text, markup = _my_day_text()
    await message.answer(text, reply_markup=markup)


@router.callback_query(F.data == "cb_energy")
async def cb_energy(callback: CallbackQuery):
    text, markup = _my_day_text()
    await callback.message.answer(text, reply_markup=markup)
    await callback.answer()


# ── Вкладки ───────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cb_good")
async def cb_good(callback: CallbackQuery):
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    extras = get_zodiac_extras(zodiac_sign, day["phase_name"]) if zodiac_sign else {}
    items = ([extras["good"]] if extras.get("good") else []) + day["good"]
    good_list = "\n".join(f"· {i}" for i in items)
    await callback.message.edit_text(
        f"✅ <b>Хорошо сегодня:</b>\n\n{good_list}",
        reply_markup=energy_detail_keyboard()
    )
    await callback.answer()


@router.callback_query(F.data == "cb_avoid")
async def cb_avoid(callback: CallbackQuery):
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    extras = get_zodiac_extras(zodiac_sign, day["phase_name"]) if zodiac_sign else {}
    items = ([extras["avoid"]] if extras.get("avoid") else []) + day["avoid"]
    avoid_list = "\n".join(f"· {i}" for i in items)
    await callback.message.edit_text(
        f"🚫 <b>Лучше отложить:</b>\n\n{avoid_list}",
        reply_markup=energy_detail_keyboard()
    )
    await callback.answer()


@router.callback_query(F.data == "cb_energy_back")
async def cb_energy_back(callback: CallbackQuery):
    text, markup = _my_day_text()
    await callback.message.edit_text(text, reply_markup=markup)
    await callback.answer()


# ── Предсказание ──────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cb_prediction")
async def cb_prediction(callback: CallbackQuery):
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    zodiac_tip = get_zodiac_tip(zodiac_sign, day["phase_name"]) if zodiac_sign else ""

    if zodiac_tip:
        original = callback.message.html_text
        await callback.message.edit_text(
            original + f"\n\n🥠 <b>Предсказание дня — только для тебя:</b>\n<tg-spoiler>{zodiac_tip}</tg-spoiler>",
            reply_markup=None
        )
    else:
        await callback.message.answer(
            "Выбери свой знак зодиака — тогда я смогу открыть предсказание.",
            reply_markup=zodiac_keyboard()
        )
    await callback.answer()


# ── Прочие кнопки меню ────────────────────────────────────────────────────────

@router.message(F.text == "✏️ Сменить знак")
async def menu_change_sign(message: Message):
    await message.answer(
        "Выбери свой знак зодиака:",
        reply_markup=zodiac_keyboard()
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
