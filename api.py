# api.py — aiohttp REST API для Telegram Mini App (Selenyx)
# Все /api/* эндпоинты требуют Telegram initData (HMAC-аутентификация)

import asyncio
import hashlib
import hmac
import json
import logging
import os
import urllib.parse
from pathlib import Path
from typing import Optional

import aiohttp as _aiohttp
from aiohttp import web

from astro import (
    get_daily_energy, get_moon_data, get_monthly_calendar,
    get_natal_chart, get_compatibility, get_day_color,
    get_zodiac_tip, get_zodiac_extras,
    get_life_path_number, get_personal_year_number,
    MOSCOW_TZ,
)
from data import (
    ZODIAC_SIGNS, ZODIAC_LABELS, SIGNS_RU_NOM,
    ZODIAC_PHASE_TIPS, MOON_SIGN_DOMAINS, PHASE_DOMAIN_CONTEXT,
    _DOMAIN_PLANETS, _DOMAIN_PRIMARY_PLANET, _PLANET_NEUTRAL,
)
from db import (
    get_user, save_user_sign, save_birth_data,
    save_notify_time, save_user_tier, init_db,
)

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
WEBAPP_URL: str = os.getenv("WEBAPP_URL") or (
    f"https://{_railway_domain}/webapp" if _railway_domain else ""
)
WEBAPP_DIR  = Path(__file__).resolve().parent / "webapp"
TGAPP_DIR   = Path(__file__).resolve().parent / "tg-app"

logger = logging.getLogger(__name__)


# ─── Auth ────────────────────────────────────────────────────────────────────


def verify_init_data(init_data: str, bot_token: str) -> Optional[dict]:
    """Проверяет подпись Telegram Mini App initData.
    Возвращает dict с user-данными или None если подпись невалидна."""
    if not init_data or not bot_token:
        return None
    try:
        params = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        tg_hash = params.pop("hash", "")
        if not tg_hash:
            return None

        # Строим data_check_string: отсортированные пары key=value через \n
        data_check = "\n".join(
            f"{k}={v}" for k, v in sorted(params.items())
        )

        # secret_key = HMAC-SHA256("WebAppData", bot_token)
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected, tg_hash):
            return None

        # Парсим user JSON
        user_str = params.get("user", "{}")
        return json.loads(user_str)
    except Exception as e:
        logger.debug(f"initData verify failed: {e}")
        return None


@web.middleware
async def auth_middleware(request: web.Request, handler):
    """Для /api/* — требует валидный X-Telegram-Init-Data или initData в query.
    Также добавляет CORS-заголовки для запросов с Vercel и других доменов."""

    # CORS: разрешаем запросы с любого origin.
    # Безопасность обеспечивается HMAC-проверкой initData — не origin'ом.
    origin = request.headers.get("Origin", "*")

    # Preflight-запрос от браузера (OPTIONS) — отвечаем сразу без проверки auth
    if request.method == "OPTIONS":
        return web.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin":  origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "X-Telegram-Init-Data, Content-Type",
                "Access-Control-Max-Age":       "3600",
            },
        )

    if request.path.startswith("/api/"):
        init_data = (
            request.headers.get("X-Telegram-Init-Data", "")
            or request.rel_url.query.get("initData", "")
        )
        user = verify_init_data(init_data, BOT_TOKEN)
        if not user:
            resp = web.json_response({"error": "Unauthorized"}, status=401)
            resp.headers["Access-Control-Allow-Origin"] = origin
            return resp
        request["tg_user"] = user

    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = origin
    return response


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _json(data: dict, status: int = 200) -> web.Response:
    return web.Response(
        text=json.dumps(data, ensure_ascii=False),
        content_type="application/json",
        status=status,
    )


def _build_today_payload(user: dict, moon: dict) -> dict:
    """Формирует полный payload для /api/today."""
    phase = moon["phase_name"]
    sign_key = moon["sign_key"]
    zodiac_sign = user.get("zodiac_sign", "")

    # Домены
    domains = {}
    for domain in ("health", "work", "love", "psych"):
        tips = (MOON_SIGN_DOMAINS.get(sign_key, {}) or {}).get(domain, [])
        context = (PHASE_DOMAIN_CONTEXT.get(phase, {}) or {}).get(domain, "")
        domains[domain] = {"tips": tips, "context": context}

    # Персональное предсказание
    prediction = get_zodiac_tip(zodiac_sign, phase) if zodiac_sign else ""
    extras = get_zodiac_extras(zodiac_sign, phase) if zodiac_sign else {}

    # Цвет дня
    color = get_day_color()

    return {
        "moon": {
            "phase_emoji":    moon["phase_emoji"],
            "phase_name":     moon["phase_name"],
            "sign_nom":       moon["sign_nom"],
            "sign_prep":      moon["sign_prep"],
            "degree":         moon["degree"],
            "lunar_day":      moon["lunar_day"],
            "lunar_day_symbol":   moon["lunar_day_symbol"],
            "lunar_day_energy":   moon["lunar_day_energy"],
            "lunar_day_practice": moon["lunar_day_practice"],
            "day_number":         moon["day_number"],
            "day_number_text":    moon["day_number_text"],
        },
        "phase_energy": {
            "intro": moon.get("intro", ""),
            "good":  moon.get("good", []),
            "avoid": moon.get("avoid", []),
            "tip":   moon.get("tip", ""),
        },
        "aspects": moon.get("aspects", []),
        "retrogrades": moon.get("retrogrades", []),
        "domains": domains,
        "prediction": prediction,
        "extras": extras,
        "color": color,
    }


# ─── Static ───────────────────────────────────────────────────────────────────


async def serve_webapp(request: web.Request) -> web.Response:
    index = WEBAPP_DIR / "index.html"
    html = index.read_bytes() if index.exists() else b"Mini App not found"
    return web.Response(body=html, content_type="text/html", charset="utf-8")


async def serve_tgapp(request: web.Request) -> web.Response:
    """Отдаёт tg-app/index.html — новая версия Mini App."""
    index = TGAPP_DIR / "index.html"
    html = index.read_bytes() if index.exists() else b"tg-app not found"
    return web.Response(body=html, content_type="text/html", charset="utf-8")


async def serve_tgapp_static(request: web.Request) -> web.Response:
    """Отдаёт статические файлы tg-app (css/, js/)."""
    # Извлекаем путь после /tgapp/
    sub = request.match_info.get("path", "")
    file_path = TGAPP_DIR / sub
    # Защита от path traversal
    try:
        file_path.resolve().relative_to(TGAPP_DIR.resolve())
    except ValueError:
        raise web.HTTPForbidden()
    if not file_path.exists() or not file_path.is_file():
        raise web.HTTPNotFound()
    # Определяем content-type по расширению
    ext = file_path.suffix.lower()
    ctype = {".css": "text/css", ".js": "application/javascript"}.get(ext, "application/octet-stream")
    return web.Response(body=file_path.read_bytes(), content_type=ctype)


async def handle_health(request: web.Request) -> web.Response:
    return web.Response(text="ok")


async def handle_options(request: web.Request) -> web.Response:
    """Ответ на CORS preflight (OPTIONS). Middleware добавит Access-Control заголовки."""
    return web.Response(status=204)


# ─── API Handlers ─────────────────────────────────────────────────────────────


async def api_me(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    user = await get_user(tg["id"])
    if not user:
        return _json({"registered": False, "name": tg.get("first_name", "")})
    return _json({
        "registered":  True,
        "name":        user.get("first_name") or tg.get("first_name", ""),
        "sign":        user.get("zodiac_sign"),
        "streak":      user.get("streak", 0),
        "notify_time": user.get("notify_time"),
        "has_birth":   bool(user.get("birth_date")),
        "tier":        user.get("tier", "free"),
    })


async def api_today(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    user = await get_user(tg["id"])
    moon = get_daily_energy()
    payload = _build_today_payload(user or {}, moon)
    return _json(payload)


async def api_moon(request: web.Request) -> web.Response:
    moon = get_moon_data()
    return _json({
        "phase_emoji":        moon["phase_emoji"],
        "phase_name":         moon["phase_name"],
        "sign_nom":           moon["sign_nom"],
        "sign_prep":          moon["sign_prep"],
        "degree":             moon["degree"],
        "lunar_day":          moon["lunar_day"],
        "lunar_day_symbol":   moon["lunar_day_symbol"],
        "lunar_day_energy":   moon["lunar_day_energy"],
        "lunar_day_practice": moon["lunar_day_practice"],
        "day_number":         moon["day_number"],
        "day_number_text":    moon["day_number_text"],
        "aspects":            moon["aspects"],
        "retrogrades":        moon["retrogrades"],
        "color":              get_day_color(),
    })


async def api_calendar(request: web.Request) -> web.Response:
    # get_monthly_calendar возвращает HTML-строку — для API вернём как есть
    cal_text = get_monthly_calendar()
    return _json({"text": cal_text})


async def api_natal_get(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    user = await get_user(tg["id"])
    if not user or not user.get("birth_date"):
        return _json({"has_data": False})
    chart = get_natal_chart(user["birth_date"], user.get("birth_time"))
    return _json({
        "has_data":  True,
        "birth_date": user["birth_date"],
        "birth_time": user.get("birth_time"),
        "sun":  {"sign": chart["sun_sign"],  "desc": chart["sun_desc"]},
        "moon": {"sign": chart["moon_sign"], "desc": chart["moon_desc"]},
        "asc":  {"sign": chart["asc_sign"],  "desc": chart["asc_desc"]} if chart["asc_sign"] else None,
    })


async def api_natal_post(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    try:
        body = await request.json()
        birth_date = body.get("birth_date", "").strip()
        birth_time = body.get("birth_time", "").strip() or None
        if not birth_date:
            return _json({"error": "birth_date required"}, status=400)
        # Проверяем что дата парсится
        get_natal_chart(birth_date, birth_time)
        await save_birth_data(tg["id"], birth_date, birth_time)
        return _json({"ok": True})
    except Exception as e:
        return _json({"error": str(e)}, status=400)


async def api_compat(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    sign2 = request.rel_url.query.get("sign", "").lower()
    if not sign2:
        return _json({"error": "sign param required"}, status=400)
    user = await get_user(tg["id"])
    sign1 = (user or {}).get("zodiac_sign", "")
    result = get_compatibility(sign1, sign2)
    return _json({
        "user_sign":   sign1,
        "target_sign": sign2,
        "rating":      result.get("rating", ""),
        "title":       result.get("title", ""),
        "text":        result.get("text", ""),
    })


async def api_notify(request: web.Request) -> web.Response:
    tg = request["tg_user"]
    try:
        body = await request.json()
        time_val = body.get("time")  # "08:00" или null
        await save_notify_time(tg["id"], time_val)
        return _json({"ok": True})
    except Exception as e:
        return _json({"error": str(e)}, status=400)


async def api_sign(request: web.Request) -> web.Response:
    """Онбординг в Mini App: сохраняет знак зодиака."""
    tg = request["tg_user"]
    try:
        body = await request.json()
        sign = body.get("sign", "").lower()
        if sign not in {k for _, k in ZODIAC_SIGNS}:
            return _json({"error": "invalid sign"}, status=400)
        name = tg.get("first_name", "")
        await save_user_sign(tg["id"], name, sign)
        return _json({"ok": True})
    except Exception as e:
        return _json({"error": str(e)}, status=400)


# ─── Server ────────────────────────────────────────────────────────────────────


async def start_api_server() -> None:
    """Запускает aiohttp-сервер: статика + REST API для Mini App."""
    port = int(os.getenv("PORT", "8080"))

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_get("/webapp",              serve_webapp)
    app.router.add_get("/",                    serve_webapp)
    app.router.add_get("/tgapp",               serve_tgapp)
    app.router.add_get("/tgapp/{path:.+}",     serve_tgapp_static)
    app.router.add_get("/health",              handle_health)
    app.router.add_get("/api/me",              api_me)
    app.router.add_get("/api/today",           api_today)
    app.router.add_get("/api/moon",            api_moon)
    app.router.add_get("/api/moon/calendar",   api_calendar)
    app.router.add_get("/api/natal",           api_natal_get)
    app.router.add_post("/api/natal",          api_natal_post)
    app.router.add_get("/api/compat",          api_compat)
    app.router.add_post("/api/notify",         api_notify)
    app.router.add_post("/api/sign",           api_sign)
    # CORS preflight — браузер отправляет OPTIONS перед реальным запросом
    app.router.add_route("OPTIONS", "/api/{path:.+}", handle_options)

    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()
    logger.info(f"API-сервер запущен на порту {port}")

    # Keep-alive: пингуем себя каждые 10 минут чтобы Railway не усыплял сервис
    health_url = f"http://localhost:{port}/health"
    while True:
        await asyncio.sleep(600)
        try:
            async with _aiohttp.ClientSession() as s:
                await s.get(health_url, timeout=_aiohttp.ClientTimeout(total=5))
        except Exception:
            pass
