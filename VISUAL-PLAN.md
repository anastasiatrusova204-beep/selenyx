# VISUAL-PLAN.md — Визуальные улучшения Selenyx

> Создан: 2026-03-31 · Завершён: 2026-04-12
> Все 6 шагов реализованы.

---

## Статус реализации

| Шаг | Описание | Статус |
|-----|----------|--------|
| 1 | Анимация арки лунного цикла | ✅ 2026-04-12 |
| 2 | Оракул: взрыв частиц + typewriter | ✅ 2026-04-12 |
| 3 | Карточки доменов: приоритетный домен | ✅ 2026-04-12 |
| 4 | Splash и переходы между экранами/вкладками | ✅ 2026-04-12 |
| 5 | CSS-диск Луны по фазе (вкладка Луна) | ✅ 2026-04-12 |
| 6 | Онбординг: звёздный фон, анимированные слайды | ✅ 2026-04-12 |

---

## Что реализовано

### Шаг 1 — Арка лунного цикла
- `arcGrow` keyframe: дуга рисуется от 0 до текущей позиции (1.2 сек)
- SVG `<animate>` на cx/cy: точка скользит по дуге при загрузке
- Пульсирующее кольцо вокруг точки (SVG `<animate>` на r/opacity)
- `glow`-фильтр: feGaussianBlur + feColorMatrix для свечения
- Число лунного дня: 34px, появляется с fade

### Шаг 2 — Оракул
- Тёмный фон с радиальным градиентом + звёздное поле на `::before`
- Взрыв частиц: 32 круга + 18 искр (`.oracle-spark`) + 8 крупных
- CSS custom props: `--tx, --ty, --dur, --delay, --size, --color, --rot`
- Typewriter: 155мс между словами, мигающий курсор `.oracle-cursor`
- Haptic: `notificationOccurred('success')` при появлении текста
- Кнопка «Поделиться» появляется с задержкой 1 сек после текста

### Шаг 3 — Приоритетный домен
- `.domain-card.domain-primary`: цветная рамка + shadow
- `::after` псевдоэлемент: бейдж «★ фокус» справа
- Приоритетный домен открывается первым, остальные закрыты
- Анимация раскрытия: `domainBodyReveal` keyframe

### Шаг 4 — Переходы
- Экраны: `screenFadeIn 0.35s ease` при `showScreen()`
- Вкладки: `paneFadeIn 0.22s ease` при `switchTab()` с reflow-reset
- Сплэш: логотип `splashItemIn 0.5s`, луна `moonPulse 3s infinite`

### Шаг 5 — CSS-диск Луны
- `_buildMoonDisc(illumination, angle)` → SVG с тёмной базой
- `clipPath` + lit semicircle + terminator `ellipse`
- `eRx = Math.abs(Math.cos(angle)) * r` — корректная форма терминатора
- `isGibbous = angle > 90 && angle <= 270` — определяет цвет терминатора
- Анимация: `moonDiscIn` при загрузке вкладки

### Шаг 6 — Онбординг
- `#onboarding-screen::before`: звёздный фон через radial-gradients
- `obSlideIn` keyframe: слайды въезжают справа
- `obIllustIn` keyframe: иллюстрация появляется с задержкой
- Переход между слайдами: анимация входящего + reset дочерних

---

## Технические файлы

- `tg-app/app.js` — `_buildCycleArc()`, `_buildMoonDisc()`, `revealFortune()`, `showScreen()`, `switchTab()`, `showObSlide()`
- `tg-app/style.css` — keyframes, `.oracle-*`, `.domain-primary`, `.moon-disc-svg`, splash-анимации
