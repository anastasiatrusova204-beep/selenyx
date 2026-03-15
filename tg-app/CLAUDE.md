# tg-app/CLAUDE.md — документация Mini App Selenyx

## Файлы

| Файл | Назначение |
|------|-----------|
| `index.html` | HTML-структура: сплэш, онбординг, 5 вкладок, оверлей настроек |
| `style.css` | Все стили: CSS-переменные, компоненты, анимации, тёмная тема |
| `data.js` | Контентные данные + вспомогательные функции расчётов |
| `app.js` | Логика навигации, Telegram SDK, рендеринг вкладок |

---

## Архитектура

```
index.html загружает data.js → app.js
app.js инициализирует tg (Telegram Web App SDK)
DOMContentLoaded → initSplash()
  ├── если localStorage.userSign → showScreen('main') → initMain()
  └── иначе → showScreen('onboarding') → initOnboarding()
```

### Экраны (в index.html)
- `#splash-screen` — логотип, 1.6 сек
- `#onboarding-screen` — 3 слайда (приветствие, что внутри, выбор знака)
- `#main-screen` — хедер + 5 вкладок + таббар

### Оверлеи
- `#settings-overlay` — выбор знака и времени уведомлений

---

## Вкладки

| data-tab | Функция рендера | Кэш |
|----------|-----------------|-----|
| `today`  | `renderToday()` | `ssGet('td')` |
| `moon`   | `renderMoon()` | `ssGet('md')` |
| `chart`  | `renderChart()` | `localStorage.userBirth` |
| `compat` | `renderCompat()` | нет (быстро) |
| `oracle` | `renderOracle()` | нет (случайно) |

---

## Где менять контент

### Знаки, фазы Луны, элементы
→ `data.js`, массив `SIGNS` (строка ~5)

### Советы по фазам (хорошо/избегай)
→ `data.js`, объект `PHASE_TIPS` (~строка 70)

### Подсказки по дням недели
→ `data.js`, объект `WEEKDAY_HINTS` (~строка 140) — ключи 0–6 (0=воскресенье)

### Энергия Луны в знаке
→ `data.js`, объект `MOON_SIGN_ENERGY` (~строка 155)

### Домены по знаку (здоровье/работа/любовь/психология)
→ `data.js`, объект `DOMAINS` (~строка 180) — ключ = id знака

### Предсказания оракула
→ `data.js`, массив `PREDICTIONS` (~строка 100) — добавляй строки свободно

### Совместимость
→ `data.js`, объект `COMPAT` (~строка 120) — ключ = `${elem1}_${elem2}`

### Лунные дни (символ, энергия, практика)
→ `data.js`, объект `LUNAR_DAYS` (~строка 215) — ключи 1–30

### Нумерология
→ `data.js`, объект `NUMEROLOGY` (~строка 130) — ключи 1–9

---

## Сессионный кэш (sessionStorage)

Ключи имеют дату-суффикс через `_dk(k)`:
- `td_ДД.ММ.ГГГГ` — данные вкладки «День»
- `md_ДД.ММ.ГГГГ` — данные вкладки «Луна»

После полуночи ключ автоматически не совпадёт → свежий расчёт.

---

## localStorage (постоянное хранилище)

- `userSign` — id знака зодиака (напр. `'aries'`)
- `userBirth` — JSON `{date: 'ДД.ММ.ГГГГ', time: 'ЧЧ:ММ'}`
- `notifyTime` — строка времени, напр. `'09:00'`

---

## Тёмная тема

`style.css` использует класс `.dark` на `<html>`.
В `app.js` функция `applyTheme()` добавляет/убирает класс по `tg.colorScheme`.

---

## Telegram SDK

```javascript
tg.ready()          // вызывается в app.js до всего
tg.expand()         // разворачивает на весь экран
tg.HapticFeedback.impactOccurred('light')   // лёгкая вибрация
tg.HapticFeedback.notificationOccurred('success')
tg.BackButton.show() / .hide() / .onClick()
tg.showPopup({ message, buttons }, callback)
```

---

## Как открыть в браузере (без Telegram)

1. Перейти в папку `tg-app/`
2. Открыть `index.html` через live-server или Python:
   ```bash
   python3 -m http.server 8080 --directory tg-app/
   # → http://localhost:8080
   ```
3. SDK-заглушка в `app.js` эмулирует `window.Telegram.WebApp` — всё работает.

---

## Что НЕ в первой версии

- Реальные API-запросы к серверу (данные из data.js)
- Push-уведомления через Railway
- Авторизация через Telegram HMAC
- Анимация взрыва частиц
- Premium gates / Telegram Stars оплата

Это standalone-версия для тестирования UX вне сервера.
