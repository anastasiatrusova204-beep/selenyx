#!/usr/bin/env python3
# bot.py — Selenyx Telegram Bot (рефакторинг: данные/расчёты/БД вынесены в отдельные модули)

# ─── Imports ──────────────────────────────────────────────────────────────────

import asyncio
import logging
import os
import re
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import aiosqlite
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatAction, ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from dotenv import load_dotenv

load_dotenv()

# ─── Модули проекта ───────────────────────────────────────────────────────────

from data import *   # все контентные константы
from astro import *  # астро-расчёты
from db import *     # база данных
from api import start_api_server  # HTTP-сервер + REST API

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("bot.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_IDS_RAW = os.getenv("ADMIN_IDS", "")
ADMIN_IDS: list[int] = [
    int(x.strip()) for x in ADMIN_IDS_RAW.split(",") if x.strip().isdigit()
]

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан в .env файле")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
WEBAPP_URL: str = os.getenv("WEBAPP_URL") or (
    f"https://{_railway_domain}/webapp" if _railway_domain else ""
)

# ─── FSM States ───────────────────────────────────────────────────────────────


class UserState(StatesGroup):
    choosing_sign    = State()   # онбординг: ждём выбор знака
    changing_sign    = State()   # смена знака: ждём новый выбор
    entering_birth_date = State()  # натальная карта: ждём дату
    entering_birth_time = State()  # натальная карта: ждём время



# ─── Keyboards ────────────────────────────────────────────────────────────────


def main_menu() -> ReplyKeyboardMarkup:
    webapp_row = (
        [KeyboardButton(text="🌙 Открыть приложение", web_app=WebAppInfo(url=WEBAPP_URL))]
        if WEBAPP_URL else []
    )
    return ReplyKeyboardMarkup(
        keyboard=[
            *([webapp_row] if webapp_row else []),
            [KeyboardButton(text="✨ Мой день")],
            [KeyboardButton(text="📅 Календарь"), KeyboardButton(text="🔔 Уведомления")],
            [KeyboardButton(text="🌟 Моя карта"), KeyboardButton(text="💞 Совместимость")],
            [KeyboardButton(text="✏️ Сменить знак"), KeyboardButton(text="ℹ️ О боте")],
        ],
        resize_keyboard=True,
        persistent=True,
    )


def start_cta_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Начать →", callback_data="cb_begin")
    ]])


def energy_tabs_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Хорошо сегодня", callback_data="cb_good"),
        InlineKeyboardButton(text="🚫 Лучше отложить", callback_data="cb_avoid"),
    ]])


def energy_detail_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Хорошо сегодня", callback_data="cb_good"),
            InlineKeyboardButton(text="🚫 Лучше отложить", callback_data="cb_avoid"),
        ],
        [InlineKeyboardButton(text="← Назад", callback_data="cb_energy_back")],
        [InlineKeyboardButton(text="🥠 Открыть личное предсказание →", callback_data="cb_prediction")],
    ])


def domain_tabs_keyboard() -> InlineKeyboardMarkup:
    """6 табов: 4 домена + цвет + лунный день + нумерология + предсказание."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏥 Здоровье", callback_data="cb_domain_health"),
            InlineKeyboardButton(text="💼 Работа",   callback_data="cb_domain_work"),
        ],
        [
            InlineKeyboardButton(text="❤️ Отношения",  callback_data="cb_domain_love"),
            InlineKeyboardButton(text="🧠 Психология", callback_data="cb_domain_psych"),
        ],
        [
            InlineKeyboardButton(text="🎨 Цвет дня",    callback_data="cb_domain_color"),
            InlineKeyboardButton(text="🌙 Лунный день", callback_data="cb_domain_day"),
        ],
        [InlineKeyboardButton(text="🔢 Нумерология дня", callback_data="cb_domain_numerology")],
        [InlineKeyboardButton(text="🥠 Предсказание дня", callback_data="cb_prediction")],
    ])


def prediction_shown_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура после раскрытия предсказания — табы + назад."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏥 Здоровье", callback_data="cb_domain_health"),
            InlineKeyboardButton(text="💼 Работа",   callback_data="cb_domain_work"),
        ],
        [
            InlineKeyboardButton(text="❤️ Отношения",  callback_data="cb_domain_love"),
            InlineKeyboardButton(text="🧠 Психология", callback_data="cb_domain_psych"),
        ],
        [
            InlineKeyboardButton(text="🎨 Цвет дня",    callback_data="cb_domain_color"),
            InlineKeyboardButton(text="🌙 Лунный день", callback_data="cb_domain_day"),
        ],
        [InlineKeyboardButton(text="🔢 Нумерология дня", callback_data="cb_domain_numerology")],
        [InlineKeyboardButton(text="← Назад", callback_data="cb_energy_back")],
    ])


def domain_detail_keyboard() -> InlineKeyboardMarkup:
    """Кнопки под раскрытым доменом — переключатель + назад."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏥 Здоровье", callback_data="cb_domain_health"),
            InlineKeyboardButton(text="💼 Работа",   callback_data="cb_domain_work"),
        ],
        [
            InlineKeyboardButton(text="❤️ Отношения", callback_data="cb_domain_love"),
            InlineKeyboardButton(text="🧠 Психология", callback_data="cb_domain_psych"),
        ],
        [
            InlineKeyboardButton(text="🎨 Цвет дня",    callback_data="cb_domain_color"),
            InlineKeyboardButton(text="🌙 Лунный день", callback_data="cb_domain_day"),
        ],
        [InlineKeyboardButton(text="🔢 Нумерология дня", callback_data="cb_domain_numerology")],
        [InlineKeyboardButton(text="← Назад", callback_data="cb_energy_back")],
    ])


def notify_keyboard(current: Optional[str] = None) -> InlineKeyboardMarkup:
    times = ["07:00", "08:00", "09:00", "10:00", "11:00"]
    rows, row = [], []
    for t in times:
        label = f"✅ {t}" if t == current else t
        row.append(InlineKeyboardButton(text=label, callback_data=f"notify:{t}"))
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton(
        text="🔕 Отключить" if current else "— Отключено",
        callback_data="notify:off",
    )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def zodiac_keyboard() -> InlineKeyboardMarkup:
    """Знаки зодиака, сгруппированные по стихиям."""
    def btn(label: str, key: str) -> InlineKeyboardButton:
        return InlineKeyboardButton(text=label, callback_data=f"zodiac:{key}")

    def sep(text: str) -> list[InlineKeyboardButton]:
        return [InlineKeyboardButton(text=text, callback_data="cb_ignore")]

    return InlineKeyboardMarkup(inline_keyboard=[
        sep("🔥 Огонь"),
        [btn("♈ Овен", "aries"), btn("♌ Лев", "leo"), btn("♐ Стрелец", "sagittarius")],
        sep("🌱 Земля"),
        [btn("♉ Телец", "taurus"), btn("♍ Дева", "virgo"), btn("♑ Козерог", "capricorn")],
        sep("💨 Воздух"),
        [btn("♊ Близнецы", "gemini"), btn("♎ Весы", "libra"), btn("♒ Водолей", "aquarius")],
        sep("💧 Вода"),
        [btn("♋ Рак", "cancer"), btn("♏ Скорпион", "scorpio"), btn("♓ Рыбы", "pisces")],
    ])



async def send_daily_notifications(bot: Bot) -> None:
    now = datetime.now(tz=MOSCOW_TZ)
    time_str = now.strftime("%H:%M")
    users = await get_users_with_notify(time_str)
    if not users:
        return
    day = get_daily_energy()
    dc = get_day_color()
    for user in users:
        try:
            name = user.get("first_name") or "друг"
            streak = await update_streak(user["user_id"])
            streak_line = f" · 🔥 {streak} дн подряд" if streak > 1 else ""
            color_line = f"· 🎨 {dc['color']}"
            if dc["hint"]:
                color_line += f" — {dc['hint']}"
            text = (
                f"🌙 <b>Доброе утро, {name}!</b>{streak_line}\n\n"
                f"· {day['phase_emoji']} Луна в {day['sign_nom']} {day['degree']}°"
                f" · {day['lunar_day']} лунный день\n"
                f"· 🔢 Число дня: {day['day_number']}\n"
                f"{color_line}\n\n"
                f"⚡ <b>Энергия дня:</b>\n{day['lunar_day_energy']}\n\n"
                f"💫 {day['lunar_day_practice']}"
            )
            await bot.send_message(
                user["user_id"],
                text,
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="✨ Мой день →", callback_data="cb_energy"),
                ]]),
            )
        except Exception as e:
            logger.warning(f"Уведомление не доставлено {user['user_id']}: {e}")



# ─── Router ───────────────────────────────────────────────────────────────────

router = Router()


# ─── /start ───────────────────────────────────────────────────────────────────


@router.message(CommandStart())
async def handle_start(message: Message, state: FSMContext) -> None:
    await state.clear()

    # Deep link из Mini App: /start wa_my_day / wa_moon / wa_natal / wa_compat
    payload = message.text.split(maxsplit=1)[1] if message.text and " " in message.text else ""
    if payload.startswith("wa_"):
        await _dispatch_webapp_action(message, payload[3:])
        return

    name = message.from_user.first_name or "друг"
    user = await get_user(message.from_user.id)

    if user and user.get("zodiac_sign"):
        sign_label = ZODIAC_LABELS.get(user["zodiac_sign"], user["zodiac_sign"])
        await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
        moon = get_moon_data()
        now = datetime.now(tz=MOSCOW_TZ)
        date_str = f"{now.day} {MONTHS_RU[now.month - 1]}, {WEEKDAYS_RU[now.weekday()]}"
        await message.answer(
            f"🌙 <b>С возвращением, {name}!</b>\n\n"
            f"· <b>Дата:</b> {date_str}\n"
            f"· <b>Фаза:</b> {moon['phase_emoji']} {moon['phase_name']}\n"
            f"· <b>Луна в</b> {moon['sign_prep']} · {moon['lunar_day']} лунный день\n"
            f"· <b>Твой знак:</b> {sign_label}",
            reply_markup=main_menu(),
        )
        await message.answer(
            "Смотрим сегодняшний день?",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="✨ Мой день →", callback_data="cb_energy"),
            ]]),
        )
    else:
        await message.answer(
            f"🌙 <b>Привет, {name}! Я — Selenyx.</b>\n\n"
            "Каждый день смотрю на реальное положение Луны и говорю простым языком:\n"
            "· какая энергия сегодня\n"
            "· на что направить силы\n"
            "· чего лучше избегать\n\n"
            "Расчёты астрономические — не шаблонные тексты по дате.\n"
            "Не предсказываю будущее — помогаю понять сегодняшний день.",
            reply_markup=start_cta_keyboard(),
        )


@router.callback_query(F.data == "cb_begin")
async def handle_begin(callback: CallbackQuery, state: FSMContext) -> None:
    name = callback.from_user.first_name or "друг"
    await state.set_state(UserState.choosing_sign)
    await callback.message.edit_text(
        f"✨ <b>Отлично, {name}!</b>\n\n"
        "Выбери свой знак зодиака — и я буду давать советы именно для тебя:",
        reply_markup=zodiac_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("zodiac:"))
async def handle_zodiac_choice(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    zodiac_key = callback.data.split(":")[1]
    sign_label = ZODIAC_LABELS.get(zodiac_key, zodiac_key)
    name = callback.from_user.first_name or "друг"

    # Проверяем до сохранения — первый раз или смена знака
    existing = await get_user(callback.from_user.id)
    is_first_time = not (existing and existing.get("zodiac_sign"))

    await save_user_sign(
        user_id=callback.from_user.id,
        first_name=name,
        zodiac_sign=zodiac_key,
    )

    await callback.message.edit_text(
        f"✨ <b>Отлично, {name}!</b>\n"
        f"Запомнила — ты {sign_label}"
    )

    if is_first_time:
        await callback.message.answer(
            f"Твоя небесная карта открыта, {name}.\n\n"
            f"Каждый день — новый слой: энергия дня, положение Луны "
            f"и личное предсказание только для {sign_label}.",
            reply_markup=main_menu(),
        )
        await callback.message.answer(
            "Смотрим первый день?",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="✨ Мой день →", callback_data="cb_energy"),
            ]]),
        )
    else:
        await callback.message.answer(
            f"Готово — знак обновлён на {sign_label}.",
            reply_markup=main_menu(),
        )

    await callback.answer()


# ─── /help ────────────────────────────────────────────────────────────────────


@router.message(Command("help"))
async def handle_help(message: Message) -> None:
    await message.answer(
        "🌙 <b>Что умеет Selenyx:</b>\n\n"
        "· <b>✨ Мой день</b> — энергия дня, лунный контекст и личное предсказание\n"
        "· <b>✏️ Сменить знак</b> — выбрать другой знак зодиака\n"
        "· <b>ℹ️ О боте</b> — что такое Selenyx\n\n"
        "<b>Команды:</b>\n"
        "· /start — начать заново\n"
        "· /help — это сообщение"
    )


# ─── /moon ────────────────────────────────────────────────────────────────────


@router.message(Command("moon"))
async def handle_moon(message: Message) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    moon = get_moon_data()
    now = datetime.now(tz=MOSCOW_TZ)
    date_str = f"{now.day} {MONTHS_RU[now.month - 1]}"

    await message.answer(
        f"{moon['phase_emoji']} <b>Луна в {moon['sign_prep']}</b> — {date_str}\n\n"
        f"· <b>Фаза:</b> {moon['phase_name']}\n"
        f"· <b>Градус:</b> {moon['degree']}°\n"
        f"· <b>Лунный день:</b> {moon['lunar_day']}\n\n"
        f"{moon['phase_meaning']}\n\n"
        f"<b>Луна в {moon['sign_nom']} говорит:</b>\n"
        f"{moon['sign_meaning']}"
    )


# ─── /today ───────────────────────────────────────────────────────────────────


@router.message(Command("today"))
async def handle_today(message: Message) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    day = get_daily_energy()
    now = datetime.now(tz=MOSCOW_TZ)
    date_str = (
        f"{now.day} {MONTHS_RU[now.month - 1]}, "
        f"{WEEKDAYS_RU[now.weekday()]}"
    )

    good_list  = "\n".join(f"· {item}" for item in day["good"])
    avoid_list = "\n".join(f"· {item}" for item in day["avoid"])

    user = await get_user(message.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    zodiac_tip  = get_zodiac_tip(zodiac_sign, day["phase_name"]) if zodiac_sign else ""
    personal_block = (
        f"\n\n🥠 <b>Предсказание дня — только для тебя:</b>\n"
        f"<tg-spoiler>{zodiac_tip}</tg-spoiler>"
        if zodiac_tip else ""
    )

    await message.answer(
        f"⚡️ <b>Энергия дня — {date_str}</b>\n\n"
        f"{day['phase_emoji']} {day['phase_name']} в {day['sign_prep']}\n\n"
        f"{day['intro']}\n\n"
        f"<b>Хорошо сегодня:</b>\n{good_list}\n\n"
        f"<b>Лучше отложить:</b>\n{avoid_list}\n\n"
        f"💫 <b>Совет дня:</b>\n{day['tip']}"
        f"{personal_block}"
    )


# ─── ✨ Мой день ──────────────────────────────────────────────────────────────


def _my_day_text(streak: int = 0) -> tuple[str, InlineKeyboardMarkup]:
    day = get_daily_energy()
    streak_line = f" · 🔥 {streak} дн подряд" if streak > 1 else ""

    retro_block = ""
    retros = day.get("retrogrades", [])
    if retros:
        lines = "\n".join(
            f"· {_RETRO_HINTS[p]['emoji']} <b>Ретро {_RETRO_HINTS[p]['name']}</b> — {_RETRO_HINTS[p]['hint']}"
            for p in retros
        )
        retro_block = f"\n\n⚠️ <b>Ретроградные планеты:</b>\n{lines}"

    text = (
        f"✨ <b>Мой день</b>{streak_line}\n\n"
        f"{day['intro']}\n\n"
        f"· {day['phase_emoji']} Луна в {day['sign_nom']} {day['degree']}° · {day['lunar_day']} лунный день"
        f"{retro_block}\n\n"
        f"⚡ <b>Энергия дня:</b>\n{day['lunar_day_energy']}\n\n"
        f"💫 <b>Практика дня:</b>\n{day['lunar_day_practice']}\n\n"
        f"Выбери, что важно сегодня:"
    )
    return text, domain_tabs_keyboard()


def _weekly_summary_text(streak: int, name: str) -> str:
    weeks = streak // 7
    if weeks == 1:
        milestone = "Первая неделя"
        note = "Ты привыкаешь жить в ритме Луны — это уже результат."
    elif weeks == 2:
        milestone = "Две недели"
        note = "Двухнедельный ритм — именно столько нужно для новой привычки."
    elif weeks == 4:
        milestone = "Целый месяц"
        note = "Ты прошла полный лунный цикл вместе с ботом. Это редкость."
    else:
        milestone = f"{weeks} недель"
        note = "Ритм стал частью дня — это и есть настоящая практика."
    return (
        f"🏆 <b>{milestone} с Selenyx!</b>\n\n"
        f"{name}, ты открываешь бот {streak} дней подряд.\n\n"
        f"{note}\n\n"
        f"· 🌑→🌕 Луна прошла {streak // 29 if streak >= 29 else 0} полных цикла\n"
        f"· 🔥 Текущий стрик: {streak} дней\n\n"
        f"<i>Следующий итог — через 7 дней.</i>"
    )


@router.message(F.text == "✨ Мой день")
async def menu_my_day(message: Message) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    streak = await update_streak(message.from_user.id)
    text, markup = _my_day_text(streak)
    await message.answer(text, reply_markup=markup)
    # Итог недели при кратном 7 стрике
    if streak > 0 and streak % 7 == 0:
        user = await get_user(message.from_user.id)
        name = (user.get("first_name") or "друг") if user else "друг"
        await message.answer(_weekly_summary_text(streak, name))


@router.callback_query(F.data == "cb_energy")
async def cb_energy(callback: CallbackQuery) -> None:
    text, markup = _my_day_text()
    await callback.message.answer(text, reply_markup=markup)
    await callback.answer()


# ─── Вкладки ──────────────────────────────────────────────────────────────────


@router.callback_query(F.data == "cb_good")
async def cb_good(callback: CallbackQuery) -> None:
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    extras = get_zodiac_extras(zodiac_sign, day["phase_name"]) if zodiac_sign else {}
    items = ([extras["good"]] if extras.get("good") else []) + day["good"]
    good_list = "\n".join(f"· {i}" for i in items)
    await callback.message.edit_text(
        f"✅ <b>Хорошо сегодня:</b>\n\n{good_list}",
        reply_markup=energy_detail_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "cb_avoid")
async def cb_avoid(callback: CallbackQuery) -> None:
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    extras = get_zodiac_extras(zodiac_sign, day["phase_name"]) if zodiac_sign else {}
    items = ([extras["avoid"]] if extras.get("avoid") else []) + day["avoid"]
    avoid_list = "\n".join(f"· {i}" for i in items)
    await callback.message.edit_text(
        f"🚫 <b>Лучше отложить:</b>\n\n{avoid_list}",
        reply_markup=energy_detail_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "cb_energy_back")
async def cb_energy_back(callback: CallbackQuery) -> None:
    text, markup = _my_day_text()
    await callback.message.edit_text(text, reply_markup=markup)
    await callback.answer()


# ─── Домены ───────────────────────────────────────────────────────────────────


_DOMAIN_PLANETS: dict = {
    "health": ["mars"],
    "work":   ["mercury", "saturn", "jupiter"],
    "love":   ["venus"],
    "psych":  ["saturn", "jupiter"],
}

# Основная планета домена (для подписи когда нет активного аспекта)
_DOMAIN_PRIMARY_PLANET: dict = {
    "health": "mars",
    "work":   "mercury",
    "love":   "venus",
    "psych":  "saturn",
}

# Нейтральный фон планеты — показывается когда нет активного аспекта
_PLANET_NEUTRAL: dict = {
    "mars":    "спокойная энергия — без резких подъёмов и спадов",
    "mercury": "обычный фон для общения и дел",
    "venus":   "нейтральный фон — хорошее время для спокойного контакта",
    "saturn":  "ровный день без давления и ограничений",
    "jupiter": "без ярких возможностей, но и без препятствий",
}


async def _show_domain(
    callback: CallbackQuery,
    domain_key: str,
    domain_emoji: str,
    domain_name: str,
) -> None:
    """Общая логика для всех 4 доменов."""
    await callback.bot.send_chat_action(callback.message.chat.id, ChatAction.TYPING)
    day = get_daily_energy()
    sign_key   = day["sign_key"]
    phase_name = day["phase_name"]
    sign_nom   = day["sign_nom"]

    phase_ctx   = PHASE_DOMAIN_CONTEXT.get(phase_name, {}).get(domain_key, "")
    bullets     = MOON_SIGN_DOMAINS.get(sign_key, {}).get(domain_key, [])
    bullet_text = "\n".join(f"· {b}" for b in bullets)

    relevant = _DOMAIN_PLANETS.get(domain_key, [])
    domain_aspects = [a for a in day.get("aspects", []) if a["planet_key"] in relevant]

    if domain_aspects:
        a = domain_aspects[0]
        aspect_line = f"\n\n· ✨ {a['label']} сегодня: {a['hint']}"
    else:
        primary = _DOMAIN_PRIMARY_PLANET.get(domain_key, "venus")
        label   = _PLANET_NAMES_RU.get(primary, primary)
        neutral = _PLANET_NEUTRAL.get(primary, "")
        aspect_line = f"\n\n· 💫 {label} сегодня: {neutral}"

    text = (
        f"{domain_emoji} <b>{domain_name}</b>\n\n"
        f"<i>{phase_ctx}</i>\n\n"
        f"<b>Луна в {sign_nom} сегодня:</b>\n{bullet_text}"
        f"{aspect_line}"
    )
    await callback.message.edit_text(text, reply_markup=domain_detail_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cb_domain_health")
async def cb_domain_health(callback: CallbackQuery) -> None:
    await _show_domain(callback, "health", "🏥", "Здоровье")


@router.callback_query(F.data == "cb_domain_work")
async def cb_domain_work(callback: CallbackQuery) -> None:
    await _show_domain(callback, "work", "💼", "Работа")


@router.callback_query(F.data == "cb_domain_love")
async def cb_domain_love(callback: CallbackQuery) -> None:
    await _show_domain(callback, "love", "❤️", "Отношения")


@router.callback_query(F.data == "cb_domain_psych")
async def cb_domain_psych(callback: CallbackQuery) -> None:
    await _show_domain(callback, "psych", "🧠", "Психология")


@router.callback_query(F.data == "cb_domain_day")
async def cb_domain_day(callback: CallbackQuery) -> None:
    await callback.bot.send_chat_action(callback.message.chat.id, ChatAction.TYPING)
    day = get_daily_energy()
    dc  = get_day_color()

    symbol = day["lunar_day_symbol"]
    parts  = [p.strip() for p in symbol.split("/")]
    symbol_line = " и ".join(parts) if len(parts) > 1 else symbol

    text = (
        f"🌙 <b>Лунный день — простым языком</b>\n\n"
        f"<b>Сегодня {day['lunar_day']} лунный день</b>\n"
        f"Луна прошла {day['lunar_day']} из 30 дней своего цикла.\n\n"
        f"🕯 <b>Символ: {symbol}</b>\n"
        f"{symbol_line} — это метафора сегодняшней энергии. "
        f"Не буквальный образ, а подсказка: как воспринимать день и на что настроиться.\n\n"
        f"<b>Что это значит сегодня:</b>\n"
        f"{day['lunar_day_energy']}\n\n"
        f"<b>Что делать с этим:</b>\n"
        f"{day['lunar_day_practice']}"
    )
    await callback.message.edit_text(text, reply_markup=domain_detail_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cb_domain_color")
async def cb_domain_color(callback: CallbackQuery) -> None:
    await callback.bot.send_chat_action(callback.message.chat.id, ChatAction.TYPING)
    dc = get_day_color()
    weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    planets  = ["Луна", "Марс", "Меркурий", "Юпитер", "Венера", "Сатурн", "Солнце"]
    now      = datetime.now(tz=MOSCOW_TZ)
    weekday_name = weekdays[now.weekday()]
    planet_name  = planets[now.weekday()]

    text = (
        f"🎨 <b>Цвет дня</b>\n\n"
        f"<b>{weekday_name} — день {planet_name}а</b>\n"
        f"Основной цвет: <b>{dc['color']}</b>\n"
        f"{dc['reason']}\n\n"
        f"🌙 <b>Луна в {dc['sign_nom']}</b>\n"
        f"{dc['hint']}\n\n"
        f"<b>Как использовать:</b>\n"
        f"· Одежда или аксессуар в основном цвете\n"
        f"· Даже один элемент — шарф, серьги, сумка — работает\n"
        f"· Акцент по знаку Луны усиливает эффект"
    )
    await callback.message.edit_text(text, reply_markup=domain_detail_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cb_domain_numerology")
async def cb_domain_numerology(callback: CallbackQuery) -> None:
    await callback.bot.send_chat_action(callback.message.chat.id, ChatAction.TYPING)
    day  = get_daily_energy()
    now  = datetime.now(tz=MOSCOW_TZ)
    user = await get_user(callback.from_user.id)
    birth_date = user.get("birth_date") if user else None

    text = (
        f"🔢 <b>Нумерология дня</b>\n\n"
        f"<b>Число дня: {day['day_number']}</b>\n"
        f"Нумерология складывает цифры сегодняшней даты в одно число — "
        f"каждое описывает общий ритм дня для всех.\n"
        f"{day['day_number_text']}"
    )
    await callback.message.edit_text(text, reply_markup=domain_detail_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cb_personal_year")
async def cb_personal_year(callback: CallbackQuery) -> None:
    now  = datetime.now(tz=MOSCOW_TZ)
    user = await get_user(callback.from_user.id)
    birth_date = user.get("birth_date") if user else None
    if not birth_date:
        await callback.answer("Сначала введи дату рождения в 🌟 Моя карта", show_alert=True)
        return

    life_path     = get_life_path_number(birth_date)
    personal_year = get_personal_year_number(life_path, now.year)
    year_text     = NUMEROLOGY_PERSONAL_YEAR.get(personal_year, "")

    text = (
        f"🔮 <b>Личный год {now.year}</b>\n\n"
        f"Число личного года — {personal_year}\n\n"
        f"{year_text}\n\n"
        f"<i>Число личного года = число судьбы + цифры текущего года.\n"
        f"Меняется каждый год — это твой личный цикл на {now.year}.</i>"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="← Назад", callback_data="cb_domain_numerology"),
        ]]),
    )
    await callback.answer()


# ─── Fortune cookie ───────────────────────────────────────────────────────────


@router.callback_query(F.data == "cb_prediction")
async def cb_prediction(callback: CallbackQuery) -> None:
    day = get_daily_energy()
    user = await get_user(callback.from_user.id)
    zodiac_sign = user.get("zodiac_sign") if user else None
    zodiac_tip  = get_zodiac_tip(zodiac_sign, day["phase_name"]) if zodiac_sign else ""

    if zodiac_tip:
        sign_name = SIGNS_RU_NOM.get(zodiac_sign.capitalize(), "") if zodiac_sign else ""
        await callback.message.edit_text(
            f"🥠 <b>Предсказание дня — только для тебя</b>\n\n"
            f"· {day['phase_emoji']} {day['phase_name']} · {sign_name}\n\n"
            f"👇 Нажми на текст, чтобы открыть:\n"
            f"<tg-spoiler>{zodiac_tip}</tg-spoiler>\n\n"
            f"<i>Обновляется каждый день</i>",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="← Назад", callback_data="cb_energy_back"),
            ]]),
        )
    else:
        await callback.message.answer(
            "Выбери свой знак зодиака — тогда я смогу открыть предсказание.",
            reply_markup=zodiac_keyboard(),
        )
    await callback.answer()


@router.callback_query(F.data == "cb_ignore")
async def cb_ignore(callback: CallbackQuery) -> None:
    await callback.answer()


# ─── Прочие кнопки меню ───────────────────────────────────────────────────────


@router.message(F.text == "✏️ Сменить знак")
async def menu_change_sign(message: Message) -> None:
    await message.answer("Выбери свой знак зодиака:", reply_markup=zodiac_keyboard())


_FAQ_TEXT = (
    "❓ <b>Частые вопросы</b>\n\n"
    "<b>Что такое «энергия дня»?</b>\n"
    "Метафора настроения дня: бывают дни для старта, бывают — для завершения или отдыха. "
    "Бот смотрит на фазу Луны и её знак — и говорит, какой «характер» у сегодня. "
    "Не предсказание, а подсказка.\n\n"
    "<b>Откуда данные о Луне?</b>\n"
    "Из Swiss Ephemeris — той же системы, что используют профессиональные астрологи. "
    "Данные реальные, астрономические. Каждый расчёт делается в момент обращения.\n\n"
    "<b>Зачем нужен мой знак зодиака?</b>\n"
    "Чтобы добавлять персональный совет. У Скорпиона и Близнецов разная реакция "
    "на одну и ту же лунную фазу. Без знака — прогноз общий для всех.\n\n"
    "<b>Что значит «ретроград»?</b>\n"
    "Планета как будто движется назад — оптическая иллюзия. "
    "В ретроград Меркурия советуют перепроверять договорённости и не покупать технику.\n\n"
    "<b>Бот предсказывает будущее?</b>\n"
    "Нет. Selenyx — навигатор, а не оракул. Он показывает «погоду» дня — "
    "что с ней делать, решаешь ты.\n\n"
    "<b>Что такое число дня?</b>\n"
    "Нумерология складывает цифры сегодняшней даты в одно число (1–9). "
    "Каждое описывает ритм дня: 1 — начинать, 4 — строить, 9 — завершать."
)

_GLOSSARY: dict = {
    "phase": {
        "title": "🌑 Фаза Луны",
        "text": (
            "Луна движется вокруг Земли и выглядит по-разному в зависимости "
            "от положения относительно Солнца. Полный цикл — ~29,5 дней, внутри 8 фаз.\n\n"
            "Каждая фаза задаёт «атмосферу»:\n"
            "· 🌑 Новолуние — начала, намерения\n"
            "· 🌔 Растущая — действие, воплощение\n"
            "· 🌕 Полнолуние — пик, завершение\n"
            "· 🌘 Убывающая — отдых, анализ"
        ),
    },
    "lunar_day": {
        "title": "🌙 Лунный день",
        "text": (
            "Лунный день — не то же самое, что календарный. "
            "Он начинается с восходом Луны и длится ~24–25 часов.\n\n"
            "Всего 29–30 лунных дней в цикле. Каждый имеет свой символ и характер:\n"
            "· 1-й — намерения и новое начало\n"
            "· 15-й (полнолуние) — пик, кульминация\n"
            "· 29-й — завершение, тишина перед новым циклом"
        ),
    },
    "moon_sign": {
        "title": "♈ Луна в знаке",
        "text": (
            "Луна движется по зодиаку быстрее Солнца — меняет знак каждые 2–3 дня. "
            "«Луна в Деве» значит, что сегодня она в секторе неба, "
            "который астрология относит к Деве.\n\n"
            "Каждый знак добавляет свой «характер»:\n"
            "· Овен — скорость, импульс\n"
            "· Телец — спокойствие, чувственность\n"
            "· Рак — эмоции, забота\n"
            "· Скорпион — глубина, трансформация"
        ),
    },
    "retro": {
        "title": "☿ Ретроград",
        "text": (
            "Планета как будто движется назад — это оптическая иллюзия "
            "из-за разной скорости орбит. На деле планета не разворачивается.\n\n"
            "Самый известный — ретроград Меркурия (3–4 раза в год, по 3 недели). "
            "В это время советуют:\n"
            "· перепроверять договорённости и документы\n"
            "· не покупать технику\n"
            "· не начинать важных переговоров\n"
            "· возвращаться к старым делам и контактам"
        ),
    },
    "natal": {
        "title": "🌟 Натальная карта",
        "text": (
            "«Астрологический паспорт» человека — карта неба в момент рождения.\n\n"
            "Три ключевых элемента:\n"
            "· <b>Солнце</b> — твоя суть, основной характер\n"
            "· <b>Луна</b> — эмоции, реакции, интуиция\n"
            "· <b>Асцендент</b> — как тебя воспринимают другие\n\n"
            "Бот рассчитывает все три в разделе 🌟 Моя карта — "
            "нужна только дата рождения."
        ),
    },
    "asc": {
        "title": "↑ Асцендент",
        "text": (
            "Знак зодиака, который восходил на горизонте в момент твоего рождения. "
            "Меняется каждые 2 часа — поэтому для точного расчёта нужно время рождения.\n\n"
            "Асцендент влияет на внешность, поведение в обществе и первое впечатление. "
            "Часто именно он «считывается» людьми сильнее, чем знак Солнца.\n\n"
            "Рассчитывается в разделе 🌟 Моя карта, если ввести время рождения."
        ),
    },
    "aspect": {
        "title": "🪐 Аспекты планет",
        "text": (
            "Аспект — угол между двумя планетами на небе. "
            "Он показывает, как они взаимодействуют: усиливают, поддерживают или создают напряжение.\n\n"
            "☌ <b>Соединение</b> — планеты рядом, энергии сливаются и усиливают друг друга\n"
            "△ <b>Гармония (трин)</b> — угол 120°, самый лёгкий аспект: всё течёт само\n"
            "✶ <b>Поддержка (секстиль)</b> — угол 60°, мягкая поддержка: хороший момент для действий\n"
            "□ <b>Напряжение (квадрат)</b> — угол 90°, трение: требует усилий, но даёт рост\n"
            "☍ <b>Противостояние (оппозиция)</b> — угол 180°, две силы тянут в разные стороны\n\n"
            "Бот показывает аспекты Луны к другим планетам — они меняются каждые несколько часов."
        ),
    },
    "numerology": {
        "title": "🔢 Число дня",
        "text": (
            "Нумерология складывает цифры сегодняшней даты в одно число от 1 до 9.\n\n"
            "Например, 9 марта 2026: 0+9+0+3+2+0+2+6 = 22 → 2+2 = <b>4</b>.\n\n"
            "Каждое число описывает «характер» дня:\n"
            "· 1 — начинать новое\n"
            "· 2 — партнёрство, терпение\n"
            "· 3 — творчество, общение\n"
            "· 4 — строить, структура\n"
            "· 5 — перемены, движение\n"
            "· 6 — забота, гармония\n"
            "· 7 — анализ, интуиция\n"
            "· 8 — сила, достижения\n"
            "· 9 — завершать, отпускать"
        ),
    },
}


def _about_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Моя статистика", callback_data="cb_stats")],
        [InlineKeyboardButton(text="✏️ Сменить знак", callback_data="cb_show_zodiac")],
        [
            InlineKeyboardButton(text="❓ Частые вопросы", callback_data="cb_faq"),
            InlineKeyboardButton(text="📖 Словарь",        callback_data="cb_glossary"),
        ],
        [InlineKeyboardButton(text="💬 Вопросы и предложения", url="https://t.me/Selenyx_mybot")],
    ])


def _glossary_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🌑 Фаза Луны",    callback_data="glos:phase"),
            InlineKeyboardButton(text="🌙 Лунный день",  callback_data="glos:lunar_day"),
        ],
        [
            InlineKeyboardButton(text="♈ Луна в знаке", callback_data="glos:moon_sign"),
            InlineKeyboardButton(text="☿ Ретроград",     callback_data="glos:retro"),
        ],
        [
            InlineKeyboardButton(text="🌟 Натальная карта", callback_data="glos:natal"),
            InlineKeyboardButton(text="↑ Асцендент",        callback_data="glos:asc"),
        ],
        [
            InlineKeyboardButton(text="🪐 Аспекты планет", callback_data="glos:aspect"),
            InlineKeyboardButton(text="🔢 Число дня",       callback_data="glos:numerology"),
        ],
        [InlineKeyboardButton(text="← Назад", callback_data="cb_about_back")],
    ])


@router.message(F.text == "ℹ️ О боте")
async def menu_about(message: Message) -> None:
    await message.answer(
        "🌙 <b>Selenyx</b> — ежедневный навигатор по ритмам дня.\n\n"
        "Луна меняет положение каждые 2–3 дня — и это реально влияет на уровень энергии, "
        "эмоциональный фон и готовность принимать решения. Не магия — биоритмика, "
        "подтверждённая исследованиями.\n\n"
        "Каждый раз, когда ты открываешь бота, он делает астрономический расчёт прямо сейчас "
        "и показывает реальное положение Луны в эту минуту. "
        "Это не шаблонные тексты по знаку и дате — "
        "это живые данные: фаза, градус, лунный день.\n\n"
        "На их основе Selenyx показывает:\n"
        "· какая сейчас лунная энергия и что с ней делать\n"
        "· как Луна в текущем знаке влияет на здоровье, работу, отношения и психологию\n"
        "· персональный прогноз — специально для твоего знака зодиака\n\n"
        "Расчёты на основе Swiss Ephemeris — той же системы, "
        "что используют профессиональные астрологи.\n\n"
        "Selenyx не предсказывает будущее.\n"
        "Он помогает лучше понять сегодняшний день.",
        reply_markup=_about_keyboard(),
    )


@router.callback_query(F.data == "cb_show_zodiac")
async def cb_show_zodiac(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(UserState.choosing_sign)
    await callback.message.answer("Выбери свой знак зодиака:", reply_markup=zodiac_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cb_faq")
async def cb_faq(callback: CallbackQuery) -> None:
    await callback.message.edit_text(
        _FAQ_TEXT,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="← Назад", callback_data="cb_about_back"),
        ]]),
    )
    await callback.answer()


@router.callback_query(F.data == "cb_glossary")
async def cb_glossary(callback: CallbackQuery) -> None:
    await callback.message.edit_text(
        "📖 <b>Словарь</b>\n\nВыбери термин — получи простое объяснение:",
        reply_markup=_glossary_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("glos:"))
async def cb_glossary_term(callback: CallbackQuery) -> None:
    key  = callback.data[5:]
    term = _GLOSSARY.get(key)
    if not term:
        await callback.answer()
        return
    await callback.message.edit_text(
        f"{term['title']}\n\n{term['text']}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="← К словарю", callback_data="cb_glossary"),
        ]]),
    )
    await callback.answer()


@router.callback_query(F.data == "cb_stats")
async def cb_stats(callback: CallbackQuery) -> None:
    user = await get_user(callback.from_user.id)
    if not user:
        await callback.answer("Данные не найдены", show_alert=True)
        return

    # Дней с регистрации
    created_raw = user.get("created_at") or ""
    try:
        created_dt = datetime.fromisoformat(created_raw[:10])
        days_total = (datetime.now(tz=MOSCOW_TZ).date() - created_dt.date()).days + 1
    except Exception:
        days_total = 1

    streak      = user.get("streak") or 0
    sign_key    = (user.get("zodiac_sign") or "").capitalize()
    sign_name   = SIGNS_RU_NOM.get(sign_key, "—")
    sign_emoji  = _SIGN_EMOJI.get(sign_key, "")
    has_natal   = bool(user.get("birth_date"))
    notify_time = user.get("notify_time")

    # Примерное кол-во пройденных фаз (фаза ~3.7 дней)
    phases_passed = max(1, round(days_total / 3.7))

    notify_line = f"🔔 Уведомление: {notify_time} по Москве" if notify_time else "🔕 Уведомления отключены"
    natal_line  = "🌟 Натальная карта: заполнена" if has_natal else "🌟 Натальная карта: не заполнена"

    # Мотивационный уровень по дням
    if days_total >= 30:
        level = "🌕 Мастер лунного ритма"
    elif days_total >= 14:
        level = "🌔 Практик"
    elif days_total >= 7:
        level = "🌓 Исследователь"
    else:
        level = "🌒 Новичок"

    text = (
        f"📊 <b>Твоя статистика</b>\n\n"
        f"· {sign_emoji} Знак: <b>{sign_name}</b>\n"
        f"· 📅 С нами: <b>{days_total} {_days_word(days_total)}</b>\n"
        f"· 🔥 Текущий стрик: <b>{streak} {_days_word(streak)}</b>\n"
        f"· 🌙 Фаз Луны пройдено: ~{phases_passed}\n\n"
        f"{notify_line}\n"
        f"{natal_line}\n\n"
        f"<b>{level}</b>"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="← Назад", callback_data="cb_about_back"),
        ]]),
    )
    await callback.answer()


def _days_word(n: int) -> str:
    """Склонение слова 'день'."""
    if 11 <= (n % 100) <= 14:
        return "дней"
    r = n % 10
    if r == 1:
        return "день"
    if 2 <= r <= 4:
        return "дня"
    return "дней"


@router.callback_query(F.data == "cb_about_back")
async def cb_about_back(callback: CallbackQuery) -> None:
    await callback.message.edit_text(
        "🌙 <b>Selenyx</b> — ежедневный навигатор по ритмам дня.\n\n"
        "Луна меняет положение каждые 2–3 дня — и это реально влияет на уровень энергии, "
        "эмоциональный фон и готовность принимать решения. Не магия — биоритмика, "
        "подтверждённая исследованиями.\n\n"
        "Каждый раз, когда ты открываешь бота, он делает астрономический расчёт прямо сейчас "
        "и показывает реальное положение Луны в эту минуту. "
        "Это не шаблонные тексты по знаку и дате — "
        "это живые данные: фаза, градус, лунный день.\n\n"
        "На их основе Selenyx показывает:\n"
        "· какая сейчас лунная энергия и что с ней делать\n"
        "· как Луна в текущем знаке влияет на здоровье, работу, отношения и психологию\n"
        "· персональный прогноз — специально для твоего знака зодиака\n\n"
        "Расчёты на основе Swiss Ephemeris — той же системы, "
        "что используют профессиональные астрологи.\n\n"
        "Selenyx не предсказывает будущее.\n"
        "Он помогает лучше понять сегодняшний день.",
        reply_markup=_about_keyboard(),
    )
    await callback.answer()


# ─── Натальная карта ─────────────────────────────────────────────────────────


def _natal_keyboard(has_data: bool) -> InlineKeyboardMarkup:
    if has_data:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🔄 Обновить данные", callback_data="cb_natal_reset"),
        ]])
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="⏭ Пропустить время", callback_data="cb_natal_skip_time"),
    ]])


@router.message(F.text == "🌟 Моя карта")
async def menu_my_chart(message: Message, state: FSMContext) -> None:
    user = await get_user(message.from_user.id)
    birth_date = user.get("birth_date") if user else None
    if birth_date:
        await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
        birth_time = user.get("birth_time")
        chart = get_natal_chart(birth_date, birth_time)
        text = _format_natal_text(chart, birth_date, birth_time)
        await message.answer(text, reply_markup=_natal_keyboard(has_data=True))
    else:
        await state.set_state(UserState.entering_birth_date)
        await message.answer(
            "🌟 <b>Натальная карта</b>\n\n"
            "Введи дату рождения в формате:\n"
            "<b>ДД.ММ.ГГГГ</b>\n\n"
            "Например: <code>15.05.1990</code>"
        )


@router.message(UserState.entering_birth_date)
async def handle_birth_date(message: Message, state: FSMContext) -> None:
    text = message.text.strip()
    m = _DATE_RE.match(text)
    if not m:
        await message.answer(
            "Не получилось распознать дату. Попробуй ещё раз в формате:\n"
            "<b>ДД.ММ.ГГГГ</b> — например: <code>15.05.1990</code>"
        )
        return
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= d <= 31 and 1 <= mo <= 12 and 1900 <= y <= 2025):
        await message.answer("Дата выглядит неправильной. Проверь и попробуй снова.")
        return
    birth_date = f"{d:02d}.{mo:02d}.{y}"
    await state.update_data(birth_date=birth_date)
    await state.set_state(UserState.entering_birth_time)
    await message.answer(
        f"Дата принята: <b>{birth_date}</b> ✓\n\n"
        "Знаешь точное время рождения?\n"
        "Введи в формате <b>ЧЧ:ММ</b> — например: <code>14:30</code>\n\n"
        "Время нужно для расчёта асцендента.\n"
        "Если не знаешь — нажми кнопку ниже.",
        reply_markup=_natal_keyboard(has_data=False),
    )


@router.message(UserState.entering_birth_time)
async def handle_birth_time(message: Message, state: FSMContext) -> None:
    text = message.text.strip()
    m = _TIME_RE.match(text)
    if not m:
        await message.answer(
            "Не получилось распознать время. Введи в формате <b>ЧЧ:ММ</b> "
            "или нажми «Пропустить время».",
            reply_markup=_natal_keyboard(has_data=False),
        )
        return
    h, mn = int(m.group(1)), int(m.group(2))
    if not (0 <= h <= 23 and 0 <= mn <= 59):
        await message.answer("Время выглядит неправильным. Попробуй снова.")
        return
    birth_time = f"{h:02d}:{mn:02d}"
    data = await state.get_data()
    birth_date = data["birth_date"]
    await state.clear()
    await save_birth_data(message.from_user.id, birth_date, birth_time)
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    chart = get_natal_chart(birth_date, birth_time)
    text = _format_natal_text(chart, birth_date, birth_time)
    await message.answer(text, reply_markup=_natal_keyboard(has_data=True))


@router.callback_query(F.data == "cb_natal_skip_time")
async def cb_natal_skip_time(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    birth_date = data.get("birth_date")
    if not birth_date:
        await callback.answer("Сначала введи дату рождения")
        return
    await state.clear()
    await save_birth_data(callback.from_user.id, birth_date, None)
    await callback.bot.send_chat_action(callback.message.chat.id, ChatAction.TYPING)
    chart = get_natal_chart(birth_date, None)
    text = _format_natal_text(chart, birth_date, None)
    await callback.message.edit_text(text, reply_markup=_natal_keyboard(has_data=True))
    await callback.answer()


@router.callback_query(F.data == "cb_natal_reset")
async def cb_natal_reset(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(UserState.entering_birth_date)
    await callback.message.answer(
        "Введи новую дату рождения в формате:\n"
        "<b>ДД.ММ.ГГГГ</b> — например: <code>15.05.1990</code>"
    )
    await callback.answer()


# ─── Совместимость ────────────────────────────────────────────────────────────


def compat_pick_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура выбора второго знака для совместимости."""
    signs = [
        ("Ari", "♈ Овен"),   ("Tau", "♉ Телец"),  ("Gem", "♊ Близнецы"),
        ("Can", "♋ Рак"),    ("Leo", "♌ Лев"),     ("Vir", "♍ Дева"),
        ("Lib", "♎ Весы"),   ("Sco", "♏ Скорпион"), ("Sag", "♐ Стрелец"),
        ("Cap", "♑ Козерог"), ("Aqu", "♒ Водолей"), ("Pis", "♓ Рыбы"),
    ]
    rows = []
    for i in range(0, 12, 3):
        rows.append([
            InlineKeyboardButton(text=label, callback_data=f"compat:{key}")
            for key, label in signs[i:i+3]
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(F.text == "💞 Совместимость")
async def menu_compat(message: Message) -> None:
    user = await get_user(message.from_user.id)
    raw_sign = user.get("zodiac_sign") if user else None
    my_sign = raw_sign.capitalize() if raw_sign else None
    if not my_sign:
        await message.answer(
            "Сначала выбери свой знак зодиака — нажми ✏️ Сменить знак.",
            reply_markup=main_menu(),
        )
        return
    my_name = SIGNS_RU_NOM.get(my_sign, my_sign)
    emoji   = _SIGN_EMOJI.get(my_sign, "")
    await message.answer(
        f"💞 <b>Совместимость</b>\n\n"
        f"Твой знак: {emoji} <b>{my_name}</b>\n\n"
        f"Выбери знак, с которым хочешь проверить совместимость:",
        reply_markup=compat_pick_keyboard(),
    )


@router.callback_query(F.data.startswith("compat:"))
async def cb_compat_sign(callback: CallbackQuery) -> None:
    their_sign = callback.data[7:]
    user = await get_user(callback.from_user.id)
    raw_sign = user.get("zodiac_sign") if user else None
    my_sign = raw_sign.capitalize() if raw_sign else None
    if not my_sign or their_sign not in SIGNS_RU_NOM:
        await callback.answer("Знак не найден", show_alert=True)
        return

    compat = get_compatibility(my_sign, their_sign)
    my_emoji    = _SIGN_EMOJI.get(my_sign, "")
    their_emoji = _SIGN_EMOJI.get(their_sign, "")
    my_name     = SIGNS_RU_NOM.get(my_sign, my_sign)
    their_name  = SIGNS_RU_NOM.get(their_sign, their_sign)

    text = (
        f"💞 {my_emoji} <b>{my_name}</b> + {their_emoji} <b>{their_name}</b>\n\n"
        f"{compat['rating']}\n"
        f"<b>{compat['title']}</b>\n\n"
        f"{compat['text']}"
    )
    # Текст для пересылки (без HTML-тегов)
    share_text = (
        f"💞 {my_emoji} {my_name} + {their_emoji} {their_name}\n\n"
        f"{compat['rating']} {compat['title']}\n\n"
        f"{compat['text']}\n\n"
        f"Проверь свою совместимость → @Selenyx_mybot"
    )
    share_url = "https://t.me/share/url?" + urllib.parse.urlencode({
        "url": "https://t.me/Selenyx_mybot",
        "text": share_text,
    })
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📤 Поделиться с другом", url=share_url)],
            [InlineKeyboardButton(text="🔄 Проверить другой знак", callback_data="compat_again")],
        ]),
    )
    await callback.answer()


@router.callback_query(F.data == "compat_again")
async def cb_compat_again(callback: CallbackQuery) -> None:
    user = await get_user(callback.from_user.id)
    raw_sign = user.get("zodiac_sign") if user else None
    my_sign = raw_sign.capitalize() if raw_sign else None
    my_name = SIGNS_RU_NOM.get(my_sign, my_sign) if my_sign else "?"
    emoji   = _SIGN_EMOJI.get(my_sign, "") if my_sign else ""
    await callback.message.edit_text(
        f"💞 <b>Совместимость</b>\n\n"
        f"Твой знак: {emoji} <b>{my_name}</b>\n\n"
        f"Выбери знак, с которым хочешь проверить совместимость:",
        reply_markup=compat_pick_keyboard(),
    )
    await callback.answer()


# ─── Лунный календарь ────────────────────────────────────────────────────────


@router.message(F.text == "📅 Календарь")
async def menu_calendar(message: Message) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    text = get_monthly_calendar()
    await message.answer(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="✨ Мой день →", callback_data="cb_energy"),
        ]]),
    )


# ─── Уведомления ─────────────────────────────────────────────────────────────


@router.message(F.text == "🔔 Уведомления")
async def menu_notifications(message: Message) -> None:
    user = await get_user(message.from_user.id)
    current = user.get("notify_time") if user else None
    status = (
        f"Сейчас: уведомление в <b>{current}</b> по Москве"
        if current else "Сейчас: уведомления отключены"
    )
    await message.answer(
        f"🔔 <b>Утреннее уведомление</b>\n\n{status}\n\n"
        "Выбери время — каждое утро буду присылать энергию дня:",
        reply_markup=notify_keyboard(current),
    )


@router.callback_query(F.data.startswith("notify:"))
async def cb_notify(callback: CallbackQuery) -> None:
    time_val = callback.data[7:]
    if time_val == "off":
        await save_notify_time(callback.from_user.id, None)
        await callback.message.edit_text(
            "🔔 <b>Утреннее уведомление</b>\n\nУведомления отключены.",
            reply_markup=notify_keyboard(None),
        )
        await callback.answer("Уведомления отключены")
    else:
        await save_notify_time(callback.from_user.id, time_val)
        await callback.message.edit_text(
            f"🔔 <b>Утреннее уведомление</b>\n\n"
            f"Готово — каждое утро в <b>{time_val}</b> по Москве буду присылать прогноз.",
            reply_markup=notify_keyboard(time_val),
        )
        await callback.answer(f"✅ {time_val}")


# ─── /admin ───────────────────────────────────────────────────────────────────


@router.message(Command("admin"))
async def handle_admin(message: Message) -> None:
    if message.from_user.id not in ADMIN_IDS:
        return

    count = await get_user_count()
    await message.answer(
        f"🛠 <b>Панель администратора</b>\n\n"
        f"· Всего пользователей: <b>{count}</b>\n\n"
        f"<b>Команды:</b>\n"
        f"· /broadcast &lt;текст&gt; — разослать сообщение всем пользователям"
    )


@router.message(Command("broadcast"))
async def handle_broadcast(message: Message) -> None:
    if message.from_user.id not in ADMIN_IDS:
        return

    # Берём текст после команды /broadcast
    args = message.text.partition(" ")[2].strip()
    if not args:
        await message.answer("Укажи текст: /broadcast Привет всем!")
        return

    user_ids = await get_all_user_ids()
    sent = 0
    failed = 0

    status_msg = await message.answer(f"Рассылка начата… (0/{len(user_ids)})")

    for uid in user_ids:
        try:
            await message.bot.send_message(uid, args)
            sent += 1
        except Exception:
            failed += 1
        # Обновляем прогресс каждые 10 сообщений
        if (sent + failed) % 10 == 0:
            try:
                await status_msg.edit_text(
                    f"Рассылка: {sent + failed}/{len(user_ids)} — ✅ {sent}, ❌ {failed}"
                )
            except Exception:
                pass

    await status_msg.edit_text(
        f"✅ Рассылка завершена\n"
        f"· Доставлено: {sent}\n"
        f"· Не доставлено: {failed}"
    )


# ─── Mini App (Web App) ───────────────────────────────────────────────────────


async def _dispatch_webapp_action(message: Message, action: str) -> None:
    """Общий обработчик действий Mini App — вызывается из web_app_data и deep link."""
    streak = await update_streak(message.from_user.id)

    if action == "my_day":
        text, markup = _my_day_text(streak)
        await message.answer(text, reply_markup=markup)
        if streak > 0 and streak % 7 == 0:
            user = await get_user(message.from_user.id)
            name = (user.get("first_name") or "друг") if user else "друг"
            await message.answer(_weekly_summary_text(streak, name))

    elif action == "moon":
        moon = get_moon_data()
        await message.answer(
            f"🌙 <b>Луна сейчас</b>\n\n"
            f"· Фаза: <b>{moon['phase_name']}</b> {moon['phase_emoji']}\n"
            f"· Луна в <b>{moon['sign_nom']}</b> {moon['degree']}°\n"
            f"· {moon['lunar_day']} лунный день",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="✨ Мой день →", callback_data="cb_energy"),
            ]]),
        )

    elif action == "natal":
        user = await get_user(message.from_user.id)
        if user and user.get("birth_date"):
            chart = get_natal_chart(user["birth_date"], user.get("birth_time"))
            sign  = SIGNS_RU_NOM.get(chart["sun_sign"].capitalize(), chart["sun_sign"])
            await message.answer(
                f"🌟 <b>Твоя натальная карта</b>\n\n"
                f"☀️ Солнце в <b>{sign}</b>\n"
                f"🌙 Луна в <b>{SIGNS_RU_NOM.get(chart['moon_sign'].capitalize(), chart['moon_sign'])}</b>\n"
                + (f"↑ Асцендент: <b>{SIGNS_RU_NOM.get(chart['asc_sign'].capitalize(), chart['asc_sign'])}</b>"
                   if chart.get("asc_sign") else "↑ Асцендент: введи время рождения"),
            )
        else:
            await message.answer(
                "🌟 <b>Моя карта</b>\n\nСначала введи дату рождения:",
                reply_markup=main_menu(),
            )

    elif action == "compat":
        user    = await get_user(message.from_user.id)
        raw_sgn = user.get("zodiac_sign") if user else None
        my_sign = raw_sgn.capitalize() if raw_sgn else None
        if my_sign:
            my_name = SIGNS_RU_NOM.get(my_sign, my_sign)
            emoji   = _SIGN_EMOJI.get(my_sign, "")
            await message.answer(
                f"💞 <b>Совместимость</b>\n\n"
                f"Твой знак: {emoji} <b>{my_name}</b>\n\n"
                f"Выбери знак:",
                reply_markup=compat_pick_keyboard(),
            )
        else:
            await message.answer(
                "Сначала выбери свой знак — нажми ✏️ Сменить знак.",
                reply_markup=main_menu(),
            )

    else:
        await message.answer("Используй меню ниже.", reply_markup=main_menu())


@router.message(F.web_app_data)
async def handle_webapp_data(message: Message) -> None:
    raw    = message.web_app_data.data or ""
    action = raw.split(":")[-1] if ":" in raw else raw
    await _dispatch_webapp_action(message, action)


# ─── Catch-all ────────────────────────────────────────────────────────────────


@router.message()
async def handle_unknown(message: Message) -> None:
    await message.answer(
        "Кажется, я не понял это сообщение 🌙\n\n"
        "Пользуйся кнопками меню — там всё нужное.",
        reply_markup=main_menu(),
    )


# ─── Main ──────────────────────────────────────────────────────────────────

async def main() -> None:
    await init_db()

    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    scheduler = AsyncIOScheduler(timezone="Europe/Moscow")
    scheduler.add_job(send_daily_notifications, "cron", minute="*", args=[bot])
    scheduler.start()

    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)

    await bot.set_my_commands([
        BotCommand(command="start",     description="Начать / вернуться в главное меню"),
        BotCommand(command="help",      description="Что умеет бот"),
    ])

    # Кнопка меню → Mini App (если URL задан)
    if WEBAPP_URL:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="🌙 Selenyx",
                web_app=WebAppInfo(url=WEBAPP_URL),
            )
        )
        logger.info(f"Menu button → {WEBAPP_URL}")

    await bot.set_my_description(
        "🌙 Selenyx — твой ежедневный космический навигатор.\n\n"
        "Каждый день бот смотрит на реальное положение Луны и говорит простым языком:\n"
        "· Какая энергия сегодня\n"
        "· На что направить силы\n"
        "· Чего лучше избегать\n\n"
        "Не нужно разбираться в астрологии. Просто открой — и начни день с фокусом.\n\n"
        "Жми /start — первый прогноз готов за 30 секунд."
    )
    await bot.set_my_short_description(
        "Энергия дня и фаза Луны — просто, без астрологических знаний"
    )

    logger.info("Selenyx запущен. Нажми Ctrl+C для остановки.")
    if WEBAPP_URL:
        logger.info(f"Mini App URL: {WEBAPP_URL}")

    # Запускаем HTTP-сервер (для Mini App) и бота параллельно
    await asyncio.gather(
        start_api_server(),
        dp.start_polling(bot, drop_pending_updates=True),
    )



if __name__ == "__main__":
    asyncio.run(main())
