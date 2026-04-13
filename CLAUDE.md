# tg-app/CLAUDE.md — документация Mini App Selenyx

> Обновлён: 2026-04-12

## Актуальные версии

| Файл | Версия | Назначение |
|------|--------|-----------|
| `index.html` | — | HTML-структура: сплэш, онбординг, вкладки, оверлеи |
| `style.css` | v=46 | Стили, анимации, тёмная тема |
| `data.js` | v=17 | Контентные данные + расчёты |
| `app.js` | v=51 | Логика навигации, Telegram SDK, рендеринг |

---

## Архитектура

```
index.html загружает data.js → app.js
DOMContentLoaded → initSplash()
  ├── localStorage.userSign → showScreen('main') → initMain()
  └── иначе → showScreen('onboarding') → initOnboarding()
```

**Экраны:** `#splash-screen` → `#onboarding-screen` (4 слайда) → `#main-screen`  
**Оверлеи:** `#settings-overlay`, `#knowledge-overlay`

---

## Вкладки (4 активных)

| data-tab | Функция | Кэш |
|----------|---------|-----|
| `today` | `renderToday()` → `applyTodayData()` | `ssGet('td')` |
| `moon` | `renderMoon()` → `applyMoonData()` | `ssGet('md')` |
| `month` | `renderMonth()` | нет |
| `oracle` | `renderOracle()` | нет |

`chart` и `compat` — скрыты (платная версия).

---

## Контентная архитектура (важно — не путать источники)

| Вкладка / блок | Источник данных |
|----------------|----------------|
| День — карточка прогноза | `ZODIAC_PHASE_TIPS[sign][phase]` |
| День — домены (аккордеон) | `DOMAINS[sign][domain]` |
| День — «Избегай» | `PHASE_TIPS[phase].avoid` |
| Луна — энергия знака | `MOON_SIGN_ENERGY[sign]` |
| Луна — лунный день | `LUNAR_DAYS[day]` |
| Оракул | `PREDICTIONS[idx]` — детерминированная ротация по дню |
| Нумерология | `NUMEROLOGY[1–9]` — поля: text/good/avoid/practice/planet |

**Оракул — формула выбора:**
```javascript
const predIdx = ((lunarDay - 1) * 13 + signIdx * 3 + weekday) % PREDICTIONS.length;
```

---

## Где менять контент

| Что | Файл | Где |
|-----|------|-----|
| Предсказания оракула | `data.js` | массив `PREDICTIONS` |
| Советы для вкладки День | `data.js` | объект `ZODIAC_PHASE_TIPS[sign][phase]` |
| Домены (здоровье/работа/любовь/психология) | `data.js` | объект `DOMAINS[sign][domain]` |
| Энергия Луны в знаке | `data.js` | объект `MOON_SIGN_ENERGY[sign]` |
| Лунные дни 1–30 | `data.js` | объект `LUNAR_DAYS[day]` |
| Нумерология | `data.js` | объект `NUMEROLOGY[1–9]` |
| Фазы Луны (хорошо/избегай) | `data.js` | объект `PHASE_TIPS[phase]` |

---

## Кэш и версии

**sessionStorage** — ключ `_dk(k)` = `k + '_' + _V + '_' + дата`:
- Протухает после полуночи
- При изменении структуры данных — бампать `_V` в начале `app.js`
- Текущий: `const _V = 'v7'`

**Инвалидация при деплое** — бампать версии в `index.html`:
```html
<script src="data.js?v=17"></script>
<script src="app.js?v=51"></script>
```

---

## BackButton — паттерн управления

```javascript
// Переключение обработчика при входе в оверлей:
tg.BackButton.offClick(старый);
tg.BackButton.onClick(новый);

// Например — при открытии статьи в базе знаний:
tg.BackButton.offClick(closeKnowledge);
tg.BackButton.onClick(_kbBackToList);  // → возврат к списку
```

---

## Telegram SDK

```javascript
tg.ready()
tg.expand()
tg.HapticFeedback.impactOccurred('light')
tg.HapticFeedback.notificationOccurred('success')
tg.BackButton.show() / .hide() / .onClick() / .offClick()
tg.showPopup({ message, buttons }, callback)
```

---

## Локальный запуск (без Telegram)

```bash
python3 -m http.server 8080 --directory tg-app/
# → http://localhost:8080
```

SDK-заглушка в `app.js` эмулирует `window.Telegram.WebApp`.
