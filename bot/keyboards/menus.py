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
    """Постоянное меню внизу экрана."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="✨ Мой день")],
            [KeyboardButton(text="✏️ Сменить знак")],
            [KeyboardButton(text="ℹ️ О боте")],
        ],
        resize_keyboard=True,
        persistent=True,
    )


def start_cta_keyboard() -> InlineKeyboardMarkup:
    """Кнопка на стартовом экране — ведёт к выбору знака."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Начать →", callback_data="cb_begin")
    ]])


def energy_tabs_keyboard() -> InlineKeyboardMarkup:
    """Вкладки под экраном Мой день."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Хорошо сегодня", callback_data="cb_good"),
        InlineKeyboardButton(text="🚫 Лучше отложить", callback_data="cb_avoid"),
    ]])


def energy_detail_keyboard() -> InlineKeyboardMarkup:
    """Кнопки под раскрытой вкладкой — переключатель + назад + предсказание."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Хорошо сегодня", callback_data="cb_good"),
            InlineKeyboardButton(text="🚫 Лучше отложить", callback_data="cb_avoid"),
        ],
        [InlineKeyboardButton(text="← Назад", callback_data="cb_energy_back")],
        [InlineKeyboardButton(text="🥠 Открыть личное предсказание →", callback_data="cb_prediction")],
    ])


def zodiac_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура с 12 знаками зодиака — 2 кнопки в ряд."""
    buttons = [
        InlineKeyboardButton(text=label, callback_data=f"zodiac:{key}")
        for label, key in ZODIAC_SIGNS
    ]
    rows = [buttons[i:i + 2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(inline_keyboard=rows)
