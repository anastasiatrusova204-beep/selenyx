/**
 * api.js — все запросы к серверу Selenyx
 *
 * Каждый запрос отправляет заголовок X-Telegram-Init-Data
 * с данными от Telegram SDK — сервер проверяет подпись (HMAC).
 * Без этого заголовка сервер вернёт 401 Unauthorized.
 *
 * Если Mini App открыта локально в браузере (не через Telegram),
 * initData будет пустой строкой — для разработки это нормально,
 * но на проде сервер будет отклонять такие запросы.
 */

/* ───────────────────────────────────────────────────────────
   НАСТРОЙКИ
   ─────────────────────────────────────────────────────────── */

// Базовый URL API — Railway-сервер с ботом и всеми /api/* маршрутами
const API_BASE = 'https://selenyx-bot-production.up.railway.app';

// Ссылка на объект Telegram WebApp SDK
// Если SDK не загружен (открыто в браузере), используем заглушку
const tg = window.Telegram?.WebApp || { initData: '' };

/* ───────────────────────────────────────────────────────────
   БАЗОВАЯ ФУНКЦИЯ ЗАПРОСА
   ─────────────────────────────────────────────────────────── */

/**
 * apiFetch — обёртка над fetch с аутентификацией Telegram
 *
 * @param {string} path        - путь API, например '/api/today'
 * @param {object} options     - опции fetch (method, body и т.д.)
 * @returns {Promise<any>}     - распарсенный JSON
 * @throws {Error}             - при HTTP-ошибке или сетевой проблеме
 */
async function apiFetch(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      // Telegram initData для проверки подлинности запроса на сервере
      'X-Telegram-Init-Data': tg.initData || '',
      'Content-Type': 'application/json',
      // Пользовательские заголовки добавляются поверх базовых
      ...(options.headers || {}),
    },
  });

  // Обработка ошибок HTTP
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Не авторизован — откройте Mini App через Telegram');
    }
    if (response.status === 404) {
      throw new Error('Данные не найдены');
    }
    throw new Error(`Ошибка сервера: ${response.status}`);
  }

  return response.json();
}

/* ───────────────────────────────────────────────────────────
   МЕТОДЫ API
   Каждая функция соответствует одному эндпоинту на сервере
   ─────────────────────────────────────────────────────────── */

/**
 * fetchMe — профиль пользователя
 * Возвращает: { name, sign, streak, notify_time, has_birth, tier }
 *   - name: имя из Telegram
 *   - sign: знак зодиака (например 'taurus') или null если не задан
 *   - streak: количество дней подряд (для бейджа 🔥)
 *   - has_birth: true если введена дата рождения (для вкладки Карта)
 *   - tier: 'free' или 'premium' (для проверки доступа к платному контенту)
 */
async function fetchMe() {
  return apiFetch('/api/me');
}

/**
 * fetchToday — данные для вкладки "Мой день"
 * Возвращает: {
 *   moon: { phase, phase_emoji, sign, sign_ru, degree, lunar_day },
 *   phase_energy: { intro, good, avoid, tip },
 *   domains: { health: [...], work: [...], love: [...], mind: [...] },
 *   prediction: "текст предсказания",
 *   extras: { good: [...], avoid: [...] },
 *   color: { name, hex },
 *   numerology: { day_number, meaning }
 * }
 */
async function fetchToday() {
  return apiFetch('/api/today');
}

/**
 * fetchMoon — подробные данные о Луне для вкладки "Луна"
 * Возвращает: {
 *   phase, phase_emoji, sign, sign_ru, degree, lunar_day,
 *   lunar_symbol, lunar_energy, lunar_practice,
 *   aspects: [{ label, aspect, hint }],
 *   retrogrades: [{ key, emoji, name, hint }]
 * }
 */
async function fetchMoon() {
  return apiFetch('/api/moon');
}

/**
 * fetchNatal — натальная карта пользователя
 * Возвращает null если дата рождения ещё не введена.
 * Если введена: { sun, moon, asc, descriptions: { sun, moon, asc } }
 *   - sun/moon/asc: название знака на русском
 *   - descriptions: текстовые описания для каждой позиции
 */
async function fetchNatal() {
  return apiFetch('/api/natal');
}

/**
 * saveNatal — сохранить дату и время рождения
 * @param {string} birthDate  - дата в формате ДД.ММ.ГГГГ
 * @param {string} birthTime  - время в формате ЧЧ:ММ (необязательно, может быть '')
 * @returns {Promise<{ok: boolean}>}
 */
async function saveNatal(birthDate, birthTime) {
  return apiFetch('/api/natal', {
    method: 'POST',
    body: JSON.stringify({
      birth_date: birthDate,
      birth_time: birthTime || null,
    }),
  });
}

/**
 * fetchCompat — совместимость со знаком партнёра
 * @param {string} sign  - знак зодиака на английском ('aries', 'taurus', ...)
 * @returns {Promise<{ rating, rating_emoji, title, text, user_sign }>}
 *   - rating: число от 1 до 5
 *   - rating_emoji: строка из эмодзи-звёзд, например '💫💫💫💫'
 *   - title: заголовок ('Сильное притяжение', 'Огонь + Земля' и т.д.)
 *   - text: краткое описание совместимости (1-2 предложения)
 */
async function fetchCompat(sign) {
  return apiFetch(`/api/compat?sign=${encodeURIComponent(sign)}`);
}

/**
 * saveSign — сохранить знак зодиака (используется в онбординге)
 * @param {string} sign  - знак зодиака на английском
 * @returns {Promise<{ok: boolean}>}
 */
async function saveSign(sign) {
  return apiFetch('/api/sign', {
    method: 'POST',
    body: JSON.stringify({ sign }),
  });
}

/**
 * saveNotifyTime — сохранить время ежедневного уведомления
 * @param {string} time  - время в формате ЧЧ:ММ, например '08:00'
 * @returns {Promise<{ok: boolean}>}
 */
async function saveNotifyTime(time) {
  return apiFetch('/api/notify', {
    method: 'POST',
    body: JSON.stringify({ time }),
  });
}

/**
 * fetchCalendar — лунный календарь на 30 дней
 * Возвращает массив из 30 объектов:
 * [{ date, phase_emoji, sign, lunar_day }, ...]
 */
async function fetchCalendar() {
  return apiFetch('/api/moon/calendar');
}

/* ───────────────────────────────────────────────────────────
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ─────────────────────────────────────────────────────────── */

/**
 * loadAll — параллельная загрузка профиля и данных дня
 * Используется при первом открытии приложения.
 * Параллельность важна — не делать последовательные запросы (waterfall).
 *
 * @returns {Promise<[meData, todayData]>}
 */
async function loadAll() {
  return Promise.all([fetchMe(), fetchToday()]);
}
