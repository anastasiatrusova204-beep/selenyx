# bot/handlers/start.py
# Онбординг: приветствие, выбор знака зодиака, сохранение в БД.

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery

from bot.db import get_user, save_user_sign
from bot.keyboards.menus import zodiac_keyboard, main_menu, ZODIAC_LABELS

router = Router()


@router.message(CommandStart())
async def handle_start(message: Message):
    name = message.from_user.first_name or "друг"
    user = await get_user(message.from_user.id)

    if user and user.get("zodiac_sign"):
        # Пользователь уже выбирал знак — показываем персональное приветствие
        sign_label = ZODIAC_LABELS.get(user["zodiac_sign"], user["zodiac_sign"])
        await message.answer(
            f"🌙 <b>С возвращением, {name}!</b>\n"
            f"Твой знак: {sign_label}\n\n"
            "Выбери что смотрим сегодня:",
            reply_markup=main_menu()
        )
    else:
        # Новый пользователь — просим выбрать знак
        await message.answer(
            f"🌙 <b>Привет, {name}! Я — Selenyx.</b>\n"
            "Твой личный космический навигатор.\n\n"
            "Чтобы начать, выбери свой знак зодиака:",
            reply_markup=zodiac_keyboard()
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
    # Показываем постоянное меню отдельным сообщением
    await callback.message.answer(
        "Выбери что смотрим сегодня:",
        reply_markup=main_menu()
    )

    # Сообщаем Telegram что нажатие обработано (убирает «часики» на кнопке)
    await callback.answer()
