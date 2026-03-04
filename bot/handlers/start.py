# bot/handlers/start.py
# Онбординг: приветствие, выбор знака зодиака, сохранение в БД.

from datetime import datetime
from zoneinfo import ZoneInfo
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery

from bot.db import get_user, save_user_sign
from bot.keyboards.menus import zodiac_keyboard, main_menu, start_cta_keyboard, ZODIAC_LABELS
from bot.services.astro import get_moon_data

MOSCOW_TZ = ZoneInfo("Europe/Moscow")
MONTHS_RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]
WEEKDAYS_RU = ["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"]

router = Router()


@router.message(CommandStart())
async def handle_start(message: Message):
    name = message.from_user.first_name or "друг"
    user = await get_user(message.from_user.id)

    if user and user.get("zodiac_sign"):
        # Пользователь уже выбирал знак — показываем персональное приветствие + метку "ты здесь"
        sign_label = ZODIAC_LABELS.get(user["zodiac_sign"], user["zodiac_sign"])
        moon = get_moon_data()
        now = datetime.now(tz=MOSCOW_TZ)
        date_str = f"{now.day} {MONTHS_RU[now.month - 1]}, {WEEKDAYS_RU[now.weekday()]}"
        await message.answer(
            f"🌙 <b>С возвращением, {name}!</b>\n\n"
            f"· <b>Дата:</b> {date_str}\n"
            f"· <b>Фаза:</b> {moon['phase_emoji']} {moon['phase_name']}\n"
            f"· <b>Луна в</b> {moon['sign_prep']} · {moon['lunar_day']} лунный день\n"
            f"· <b>Твой знак:</b> {sign_label}",
            reply_markup=main_menu()
        )
    else:
        # Новый пользователь — показываем описание как стартовый экран
        await message.answer(
            f"🌙 <b>Привет, {name}! Я — Selenyx.</b>\n\n"
            "Каждый день Луна говорит что-то важное — "
            "ты попал в число тех, кто может это услышать.",
            reply_markup=start_cta_keyboard()
        )


@router.callback_query(F.data == "cb_begin")
async def handle_begin(callback: CallbackQuery):
    name = callback.from_user.first_name or "друг"
    await callback.message.edit_text(
        f"✨ <b>Отлично, {name}!</b>\n\n"
        "Выбери свой знак зодиака — и я буду давать советы именно для тебя:",
        reply_markup=zodiac_keyboard()
    )
    await callback.answer()


@router.message(Command("help"))
async def handle_help(message: Message):
    await message.answer(
        "🌙 <b>Что умеет Selenyx:</b>\n\n"
        "· <b>✨ Мой день</b> — энергия дня, лунный контекст и личное предсказание\n"
        "· <b>✏️ Сменить знак</b> — выбрать другой знак зодиака\n"
        "· <b>ℹ️ О боте</b> — что такое Selenyx\n\n"
        "<b>Команды:</b>\n"
        "· /start — начать заново\n"
        "· /today — мой день\n"
        "· /help — это сообщение"
    )


# Этот обработчик срабатывает когда пользователь нажимает кнопку знака.
# F.data.startswith("zodiac:") — фильтр: реагируем только на кнопки со знаками.
@router.callback_query(F.data.startswith("zodiac:"))
async def handle_zodiac_choice(callback: CallbackQuery):
    # Из "zodiac:aries" берём только "aries"
    zodiac_key = callback.data.split(":")[1]
    sign_label = ZODIAC_LABELS.get(zodiac_key, zodiac_key)
    name = callback.from_user.first_name or "друг"

    # Сохраняем знак в базу данных
    await save_user_sign(
        user_id=callback.from_user.id,
        first_name=name,
        zodiac_sign=zodiac_key
    )

    # Убираем inline-кнопки и подтверждаем выбор
    await callback.message.edit_text(
        f"✨ <b>Отлично, {name}!</b>\n"
        f"Запомнила — ты {sign_label}"
    )
    # Показываем постоянное меню с крючком о глубине
    await callback.message.answer(
        f"Твоя небесная карта открыта, {name}.\n\n"
        f"Каждый день — новый слой: энергия дня, положение Луны "
        f"и личное предсказание только для {sign_label}.\n\n"
        "А впереди — ещё глубже: натальная карта и персональные прогнозы. "
        "Всё это будет здесь.\n\n"
        "Начнём?",
        reply_markup=main_menu()
    )

    # Сообщаем Telegram что нажатие обработано (убирает «часики» на кнопке)
    await callback.answer()
