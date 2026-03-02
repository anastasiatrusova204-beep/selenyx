# bot/keyboards/menus.py
# Клавиатуры — кнопки которые видит пользователь в боте.
# InlineKeyboardMarkup — кнопки прямо под сообщением (не внизу экрана).

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton

# Список знаков: (текст кнопки, внутренний ключ)
ZODIAC_SIGNS = [
    ("♈ Овен",     "aries"),
    ("♉ Телец",    "taurus"),
    ("♊ Близнецы", "gemini"),
    ("♋ Рак",      "cancer"),
    ("♌ Лев",      "leo"),
    ("♍ Дева",     "virgo"),
    ("♎ Весы",     "libra"),
    ("♏ Скорпион", "scorpio"),
    ("♐ Стрелец",  "sagittarius"),
    ("♑ Козерог",  "capricorn"),
    ("♒ Водолей",  "aquarius"),
    ("♓ Рыбы",     "pisces"),
]

# Словарь для обратного перевода ключа → текст (используем в подтверждении)
ZODIAC_LABELS = {key: label for label, key in ZODIAC_SIGNS}


def main_menu() -> ReplyKeyboardMarkup:
    """Постоянное меню внизу экрана — три кнопки."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="⚡️ Энергия дня"), KeyboardButton(text="🌙 Луна")],
            [KeyboardButton(text="✏️ Сменить знак")],
            [KeyboardButton(text="ℹ️ О боте")],
        ],
        resize_keyboard=True,   # кнопки поменьше, не занимают пол-экрана
        persistent=True,        # меню не прячется после нажатия
    )


def zodiac_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура с 12 знаками зодиака — 3 кнопки в ряд."""
    buttons = [
        InlineKeyboardButton(text=label, callback_data=f"zodiac:{key}")
        for label, key in ZODIAC_SIGNS
    ]
    # Разбиваем на ряды по 2 кнопки — длинные названия не обрезаются
    rows = [buttons[i:i + 2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(inline_keyboard=rows)
