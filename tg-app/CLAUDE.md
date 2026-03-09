# tg-app/ — Mini App Selenyx

Это Mini App для Telegram-бота Selenyx.
Открывается внутри Telegram через кнопку WebApp.
Файлы отдаются сервером из api.py (GET /tgapp → index.html).

---

## Структура файлов

```
tg-app/
├── index.html        ← Точка входа. HTML-скелет всех экранов.
├── CLAUDE.md         ← Этот файл — документация для разработчика.
├── css/
│   └── style.css     ← Все стили. CSS-переменные, компоненты, адаптив.
└── js/
    ├── api.js        ← Запросы к серверу. apiFetch() + все API-функции.
    ├── screens.js    ← Отрисовка вкладок. renderToday/Moon/Natal/Compat().
    └── app.js        ← Точка входа JS. Навигация, анимации, инициализация.
```

**Порядок подключения JS важен:** api.js → screens.js → app.js

---

## Экраны и навигация

```
loading         ← показывается пока грузятся данные (/api/me + /api/today)
  ↓ (500ms или ответ API)
  ├── onboarding   ← если sign = null (знак не задан)
  │     ↓ (выбор знака → POST /api/sign)
  └── moon-entry   ← анимированная Луна
        ↓ (тап по Луне → взрыв частиц 850мс)
        app          ← основное SPA (4 вкладки)
```

### Функции навигации (в app.js)
- `showScreen(id)` — переключает видимый экран
- `showMoonEntry()` — переходит на экран с Луной
- `showOnboarding()` — переходит на экран выбора знака
- `enterApp()` — переходит в основное приложение
- `switchTab(key)` — переключает вкладку ('today' | 'moon' | 'natal' | 'compat')

### Back Button Telegram
- На экране `app` → Back Button показан, тап возвращает на `moon-entry`
- На экране `moon-entry` → Back Button скрыт

---

## Вкладки и данные

| Вкладка      | ID элемента  | Данные из API      | Функция отрисовки      |
|-------------|-------------|-------------------|----------------------|
| ✨ Мой день  | #tab-today  | /api/me + /api/today | `renderToday(me, today)` |
| 🌙 Луна      | #tab-moon   | /api/moon          | `renderMoon(data)`      |
| 🌟 Моя карта | #tab-natal  | /api/natal         | `renderNatal(data)`     |
| 💞 Совмест.  | #tab-compat | /api/compat?sign=X | `renderCompat(sign, data)` |

### Ленивая загрузка
Данные для вкладки загружаются только при первом открытии (см. `loadTabData()` в app.js).
Вкладка "Мой день" загружается при старте параллельно с профилем.

---

## API-запросы (api.js)

Все запросы отправляют заголовок:
```
X-Telegram-Init-Data: <tg.initData>
```

Без этого заголовка сервер вернёт 401.
При локальной разработке (в браузере, не в Telegram) initData = ''.

### Доступные функции
```javascript
fetchMe()                      // GET /api/me
fetchToday()                   // GET /api/today
fetchMoon()                    // GET /api/moon
fetchNatal()                   // GET /api/natal
saveNatal(birthDate, birthTime) // POST /api/natal
fetchCompat(sign)              // GET /api/compat?sign=...
saveSign(sign)                 // POST /api/sign
saveNotifyTime(time)           // POST /api/notify
fetchCalendar()                // GET /api/moon/calendar
loadAll()                      // Promise.all([fetchMe(), fetchToday()])
```

---

## Где менять данные (не-программисту)

### Изменить список знаков зодиака
→ `js/app.js`, константа `ZODIAC_LIST` (строки 15–28)

### Изменить символы и цвета аспектов
→ `js/screens.js`, константа `ASPECT_DISPLAY` (строки 15–21)

### Изменить названия доменов ("Здоровье" и т.д.)
→ `js/screens.js`, константа `DOMAIN_LABELS` (строки 24–29)

### Изменить цвета приложения
→ `css/style.css`, секция `:root { }` (строки 8–35)
  - `--accent` — основной фиолетовый
  - `--gold` — золотой (стрик, premium)
  - `--bg` — фон
  - `--text` — основной текст

### Изменить шрифты
→ `css/style.css` строки 24–25 и `index.html` строки 11–13
  Текущие шрифты: `Cormorant Garamond` (заголовки) + `DM Sans` (текст)

### Изменить цену на Premium Gates
→ `js/screens.js` — поиск по тексту "490 Звёзд" и "~330 ₽"

---

## Premium Gates (заглушки)

Сейчас `buyFeature(featureId)` показывает только toast.
В Шаге 12 заменить на:
```javascript
tg.openInvoice(invoiceLink, (status) => {
  if (status === 'paid') {
    // обновить tier пользователя и перерисовать вкладку
  }
});
```

Платные фичи:
- `natal_forecast` — Прогноз на год (490 ⭐)
- `compat_deep` — Детальный анализ совместимости (490 ⭐)

---

## Мобильная адаптация (важно)

- Кнопки: минимум 44px высоты (touch target)
- Шрифт: минимум 14px (нет мелкого текста)
- Safe area: `env(safe-area-inset-bottom)` в таб-баре и padding контента
- Горизонтальный скролл: запрещён (`overflow-x: hidden` на body)
- Двойной тап: убран через `touch-action: manipulation`
- Анимации: отключаются при `prefers-reduced-motion: reduce`

---

## Локальная разработка

1. Запустить бот: `pkill -9 -f "bot.py"; sleep 6; venv/bin/python3 bot.py > bot.log 2>&1 &`
2. Открыть браузер: `http://localhost:8080/tgapp`
3. initData будет пустым — сервер вернёт 401 для `/api/*`
4. Для тестирования без авторизации — временно убери проверку HMAC в api.py

---

## Деплой

Mini App автоматически деплоится вместе с ботом:
```bash
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway up --service selenyx-bot
```

URL Mini App на проде: `https://<railway-domain>/tgapp`
Настроить в BotFather: `/setmenubutton` → Web App URL

---

## Связанные файлы в проекте

- `api.py` — сервер, отдаёт HTML и обрабатывает `/api/*` запросы
- `astro.py` — астро-расчёты (данные для /api/today и /api/moon)
- `db.py` — БД-функции (данные для /api/me)
- `data.py` — константы (знаки, аспекты, домены, предсказания)
- `webapp/index.html` — старая версия Mini App (one-file SPA, оставлена для совместимости)
