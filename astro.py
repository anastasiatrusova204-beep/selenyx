# astro.py — астрологические расчёты Selenyx
import logging
import re
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from kerykeion import AstrologicalSubject

from data import (
    PHASES, PHASE_ENERGY, LUNAR_DAYS, MOON_ASPECT_HINTS,
    NUMEROLOGY_DAY, NUMEROLOGY_LIFE_PATH, NUMEROLOGY_PERSONAL_YEAR,
    SUN_SIGN_DESC, MOON_SIGN_DESC, ASC_SIGN_DESC,
    SIGNS_RU, SIGNS_RU_NOM, SIGN_MEANING,
    _SIGN_ELEMENT, _COMPAT_TABLE,
    _WEEKDAY_COLORS, _MOON_SIGN_COLOR_HINT,
    _PLANET_NAMES_RU, _ASPECT_DEFS,
    ZODIAC_PHASE_TIPS, ZODIAC_PHASE_EXTRAS,
    MONTHS_RU, WEEKDAYS_RU,
    _RETRO_HINTS,
)

MOSCOW_TZ = ZoneInfo("Europe/Moscow")

_DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$")
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")

_KEY_PHASES = {"Новолуние", "Первая четверть", "Полнолуние", "Последняя четверть"}
_MONTHS_GEN = ["янв", "фев", "мар", "апр", "май", "июн",
               "июл", "авг", "сен", "окт", "ноя", "дек"]
_WDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]

def get_day_number(dt: "datetime") -> int:
    """Нумерологическое число дня: сумма цифр даты до однозначного (1–9)."""
    total = dt.day + dt.month + dt.year
    while total > 9:
        total = sum(int(d) for d in str(total))
    return total


def get_life_path_number(birth_date: str) -> int:
    """Число судьбы: сумма цифр даты рождения до однозначного (1–9)."""
    d, m, y = (int(x) for x in birth_date.split("."))
    total = d + m + y
    while total > 9:
        total = sum(int(dig) for dig in str(total))
    return total


def get_personal_year_number(life_path: int, year: int) -> int:
    """Число личного года = число судьбы + цифры текущего года."""
    year_sum = sum(int(dig) for dig in str(year))
    total = life_path + year_sum
    while total > 9:
        total = sum(int(dig) for dig in str(total))
    return total


def get_compatibility(sign1: str, sign2: str) -> dict:
    """Возвращает данные о совместимости двух знаков."""
    s1 = sign1.capitalize()
    s2 = sign2.capitalize()
    if s1 == s2:
        return _COMPAT_TABLE["same"]
    elems = tuple(sorted([_SIGN_ELEMENT[s1], _SIGN_ELEMENT[s2]]))
    return _COMPAT_TABLE.get(elems, _COMPAT_TABLE["same"])

def get_moon_data() -> dict:
    now = datetime.now(tz=MOSCOW_TZ)
    logging.getLogger("root").setLevel(logging.ERROR)
    subject = AstrologicalSubject(
        "Now",
        now.year, now.month, now.day,
        now.hour, now.minute,
        "Moscow", "RU",
    )
    logging.getLogger("root").setLevel(logging.INFO)

    sign_key = subject.moon.sign
    moon_lon = subject.moon.abs_pos
    sun_lon  = subject.sun.abs_pos
    angle    = (moon_lon - sun_lon) % 360

    emoji, phase_name, phase_meaning = "🌙", "Растущая Луна", ""
    for threshold, em, name, meaning in PHASES:
        if angle < threshold:
            emoji, phase_name, phase_meaning = em, name, meaning
            break

    lunar_day = min(int(angle / 12.19) + 1, 30)
    lunar_day_info = LUNAR_DAYS.get(lunar_day, {})
    aspects = _compute_moon_aspects(subject)
    day_number = get_day_number(now)

    retrogrades = [
        {
            "key":   p,
            "emoji": _RETRO_HINTS[p]["emoji"],
            "name":  _RETRO_HINTS[p]["name"],
            "hint":  _RETRO_HINTS[p]["hint"],
        }
        for p in ["mercury", "venus", "mars", "jupiter", "saturn"]
        if getattr(subject, p).retrograde
    ]

    return {
        "sign_key":           sign_key,
        "sign_prep":          SIGNS_RU.get(sign_key, sign_key),
        "sign_nom":           SIGNS_RU_NOM.get(sign_key, sign_key),
        "sign_meaning":       SIGN_MEANING.get(sign_key, ""),
        "phase_emoji":        emoji,
        "phase_name":         phase_name,
        "phase_meaning":      phase_meaning,
        "lunar_day":          lunar_day,
        "degree":             round(subject.moon.position, 1),
        "lunar_day_symbol":   lunar_day_info.get("symbol", ""),
        "lunar_day_energy":   lunar_day_info.get("energy", ""),
        "lunar_day_practice": lunar_day_info.get("practice", ""),
        "aspects":            aspects,
        "day_number":         day_number,
        "day_number_text":    NUMEROLOGY_DAY.get(day_number, ""),
        "retrogrades":        retrogrades,
    }


def get_natal_chart(birth_date: str, birth_time: Optional[str] = None) -> dict:
    """Рассчитывает натальную карту по дате (и времени) рождения."""
    d, m, y = (int(x) for x in birth_date.split("."))
    has_time = bool(birth_time)
    h, mn = (int(x) for x in birth_time.split(":")) if has_time else (12, 0)
    logging.getLogger("root").setLevel(logging.ERROR)
    subject = AstrologicalSubject("User", y, m, d, h, mn, "Moscow", "RU")
    logging.getLogger("root").setLevel(logging.INFO)
    sun_key  = subject.sun.sign
    moon_key = subject.moon.sign
    asc_key  = subject.first_house.sign if has_time else None
    return {
        "sun_key":  sun_key,
        "sun_sign": SIGNS_RU_NOM.get(sun_key, sun_key),
        "sun_desc": SUN_SIGN_DESC.get(sun_key, ""),
        "moon_key":  moon_key,
        "moon_sign": SIGNS_RU_NOM.get(moon_key, moon_key),
        "moon_desc": MOON_SIGN_DESC.get(moon_key, ""),
        "asc_key":  asc_key,
        "asc_sign": SIGNS_RU_NOM.get(asc_key, "") if asc_key else None,
        "asc_desc": ASC_SIGN_DESC.get(asc_key, "") if asc_key else None,
        "has_time": has_time,
    }


def _format_natal_text(chart: dict, birth_date: str, birth_time: Optional[str]) -> str:
    lines = ["🌟 <b>Твоя натальная карта</b>\n"]
    lines.append(f"☀️ <b>Солнце в {chart['sun_sign']}</b>")
    lines.append(chart["sun_desc"])
    lines.append(f"\n🌙 <b>Луна в {chart['moon_sign']}</b>")
    lines.append(chart["moon_desc"])
    if chart["asc_sign"]:
        lines.append(f"\n↑ <b>Асцендент в {chart['asc_sign']}</b>")
        lines.append(chart["asc_desc"])
    else:
        lines.append("\n↑ <b>Асцендент</b> — не рассчитан")
        lines.append("Чтобы узнать асцендент, нужно точное время рождения.")
    lines.append(f"\n<i>Дата рождения: {birth_date}"
                 + (f", {birth_time}" if birth_time else "") + "</i>")
    return "\n".join(lines)


def get_daily_energy() -> dict:
    moon = get_moon_data()
    energy = PHASE_ENERGY.get(moon["phase_name"], PHASE_ENERGY["Растущая Луна"])
    return {**moon, **energy}


def _moon_for_date(dt: datetime) -> dict:
    """Фаза и знак Луны для конкретной даты (полдень МСК, без аспектов)."""
    logging.getLogger("root").setLevel(logging.ERROR)
    subject = AstrologicalSubject(
        "Cal", dt.year, dt.month, dt.day, 12, 0, "Moscow", "RU",
    )
    logging.getLogger("root").setLevel(logging.INFO)
    sign_key = subject.moon.sign
    moon_lon = subject.moon.abs_pos
    sun_lon  = subject.sun.abs_pos
    angle    = (moon_lon - sun_lon) % 360
    emoji, phase_name = "🌙", "Растущая Луна"
    for threshold, em, name, _ in PHASES:
        if angle < threshold:
            emoji, phase_name = em, name
            break
    lunar_day = min(int(angle / 12.19) + 1, 30)
    return {
        "sign_nom":   SIGNS_RU_NOM.get(sign_key, sign_key),
        "phase_emoji": emoji,
        "phase_name":  phase_name,
        "lunar_day":   lunar_day,
    }


_KEY_PHASES = {"Новолуние", "Первая четверть", "Полнолуние", "Последняя четверть"}
_MONTHS_GEN = ["янв", "фев", "мар", "апр", "май", "июн",
               "июл", "авг", "сен", "окт", "ноя", "дек"]
_WDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]

def get_monthly_calendar() -> str:
    """Лунный календарь: только переходы фаз на 30 дней."""
    now = datetime.now(tz=MOSCOW_TZ)

    # Смысл каждой фазы — одна строка
    _PHASE_ACTION = {
        "Новолуние":       "Ставь намерения, начинай с чистого листа",
        "Растущий серп":   "Делай первые шаги, запускай планы",
        "Первая четверть": "Преодолевай препятствия, действуй активно",
        "Растущая Луна":   "Воплощай задуманное, энергия на пике",
        "Полнолуние":      "Завершай начатое, подводи итоги",
        "Убывающая Луна":  "Делись, отдавай, отпускай лишнее",
        "Последняя четверть": "Анализируй, делай выводы",
        "Убывающий серп":  "Отдыхай, восстанавливайся перед новым циклом",
    }

    events = []
    prev_phase = None
    for i in range(30):
        dt = now + timedelta(days=i)
        m  = _moon_for_date(dt)
        if m["phase_name"] != prev_phase:
            events.append((dt, m))
            prev_phase = m["phase_name"]

    month_name = MONTHS_RU[now.month - 1]
    lines = [
        f"📅 <b>Лунный календарь — {month_name} {now.year}</b>\n",
        "Когда и какая энергия будет — и что с ней делать:\n",
    ]
    for dt, m in events:
        date_str = f"{dt.day} {_MONTHS_GEN[dt.month - 1]}, {_WDAYS_SHORT[dt.weekday()]}"
        action   = _PHASE_ACTION.get(m["phase_name"], "")
        lines.append(
            f"{m['phase_emoji']} <b>{date_str} — {m['phase_name']}</b> в {m['sign_nom']}\n"
            f"<i>{action}</i>"
        )
    return "\n\n".join(lines)


def _compute_moon_aspects(subject) -> list[dict]:
    moon_lon = subject.moon.abs_pos
    results = []
    for planet_key in ("venus", "mars", "saturn", "mercury", "jupiter"):
        planet_lon = getattr(subject, planet_key).abs_pos
        diff = abs((planet_lon - moon_lon + 180) % 360 - 180)
        for asp_deg, asp_name, orb in _ASPECT_DEFS:
            if abs(diff - asp_deg) <= orb:
                hint = MOON_ASPECT_HINTS.get((planet_key, asp_name), "")
                if hint:
                    results.append({
                        "planet_key": planet_key,
                        "label":      _PLANET_NAMES_RU.get(planet_key, planet_key),
                        "aspect":     asp_name,
                        "hint":       hint,
                    })
                break
    return results


def get_zodiac_tip(zodiac_key: str, phase_name: str) -> str:
    return ZODIAC_PHASE_TIPS.get(zodiac_key, {}).get(phase_name, "")


def get_zodiac_extras(zodiac_key: str, phase_name: str) -> dict:
    return ZODIAC_PHASE_EXTRAS.get(zodiac_key, {}).get(phase_name, {})


def get_day_color() -> dict:
    """Цвет дня: основной по планете дня + акцент по знаку Луны."""
    now = datetime.now(tz=MOSCOW_TZ)
    color, reason = _WEEKDAY_COLORS[now.weekday()]
    moon = get_moon_data()
    hint = _MOON_SIGN_COLOR_HINT.get(moon["sign_nom"], "")
    return {"color": color, "reason": reason, "hint": hint, "sign_nom": moon["sign_nom"]}

