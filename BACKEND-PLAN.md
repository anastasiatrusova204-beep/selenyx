# BACKEND-PLAN.md — Selenyx 2.0
> Составлен по результатам discovery-interview, 2026-03-29
> Архитектор: Claude (Sonnet 4.6)

---

## Суть продукта

Selenyx — персональный AI-навигатор для людей, потерявших ориентир. Астрология как крючок ежедневной привычки, база знаний и психологические практики как причина оставаться.

**Два слоя:**
- **Бесплатно** — ежедневный прогноз (крючок, формирует привычку)
- **Платно 299 ₽/мес** — база знаний, глубокая персонализация, темы оформления

**Приоритет разработки:** Крючок (онбординг + привычка) → Оплата → База знаний → AI-видео

---

## 1. Роли и доступ

| Роль | Кто | Что видит и делает |
|---|---|---|
| `guest` | Новый пользователь до онбординга | Только сплэш + квиз |
| `free` | Прошёл онбординг, не платит | 5 модулей дня, оракул, луна, месяц |
| `paid` | Активная подписка | Всё + база знаний, натальная карта, выбор темы |
| `admin` | Владелец (ты) | Управление контентом, аналитика, пуши |

---

## 2. База данных

### Хранилище
- **MVP (до 1000 юзеров):** SQLite на Beget VPS — файл `/data/selenyx.db`
- **При росте >1000:** миграция на PostgreSQL (тот же Beget, managed DB)

---

### Таблица: `users`
```sql
user_id        INTEGER PRIMARY KEY   -- Telegram user_id
first_name     TEXT
zodiac_sign    TEXT                  -- 'aries', 'taurus', ...
birth_date     TEXT                  -- 'ДД.ММ.ГГГГ' (для натальной карты)
birth_time     TEXT                  -- 'ЧЧ:ММ' (опционально)
birth_place    TEXT                  -- город рождения
email          TEXT
created_at     DATETIME DEFAULT NOW
last_visit     DATETIME
streak         INTEGER DEFAULT 0
notify_time    TEXT                  -- '09:00'
tier           TEXT DEFAULT 'free'   -- 'free' | 'paid'
theme          TEXT DEFAULT 'light'  -- 'light' | 'dark' | 'gold'
onboarding_done BOOLEAN DEFAULT 0
```

### Таблица: `subscriptions`
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
status         TEXT    -- 'trial' | 'active' | 'cancelled' | 'expired'
started_at     DATETIME
trial_ends_at  DATETIME  -- started_at + 7 дней
paid_until     DATETIME
yookassa_id    TEXT      -- ID платежа в ЮKassa
amount         INTEGER   -- 299
cancelled_at   DATETIME  -- NULL если активна
```

### Таблица: `onboarding_answers`
Хранит ответы квиза — основа для AI-персонализации и пушей.
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
goal           TEXT     -- 'отношения' | 'карьера' | 'самопознание' | 'здоровье'
goal_text      TEXT     -- свободный ответ: "хочу разобраться в отношениях"
current_state  TEXT     -- одно слово состояния: "тревога", "потерянность"
ai_insight     TEXT     -- ответ GPT на current_state (кешируется)
experience_level TEXT   -- 'beginner' | 'intermediate' | 'advanced'
goal_90days    TEXT     -- "что хочу изменить за 90 дней"
created_at     DATETIME
```

### Таблица: `knowledge_items`
Контент базы знаний — управляется из админки.
```sql
id             INTEGER PRIMARY KEY
title          TEXT
content        TEXT      -- markdown
category       TEXT      -- 'numerology' | 'psychology' | 'astrology' | 'practices'
unlock_month   INTEGER   -- 1 = открывается в 1-й месяц, 2 = во 2-й, 3 = в 3-й
tags           TEXT      -- JSON: ["отношения", "тревога"]
goal_tags      TEXT      -- JSON: для каких целей из анкеты показывать
level          TEXT      -- 'beginner' | 'intermediate' | 'advanced'
media_url      TEXT      -- ссылка на видео (фаза 2: AI-аватар)
created_at     DATETIME
published      BOOLEAN DEFAULT 1
```

### Таблица: `user_progress`
Отслеживает прогресс по базе знаний и ежедневным привычкам.
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
item_id        INTEGER REFERENCES knowledge_items  -- NULL для дневных действий
action         TEXT    -- 'opened' | 'completed' | 'saved' | 'shared'
mood_after     INTEGER -- 1-5 после прочтения (опционально)
created_at     DATETIME
```

### Таблица: `daily_feedback`
Кнопки «В точку» / «Не про меня» под прогнозом.
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
date           TEXT      -- 'ГГГГ-ММ-ДД'
reaction       TEXT      -- 'hit' | 'miss'
prognosis_type TEXT      -- 'daily' | 'numerology' | 'color' | 'domain'
created_at     DATETIME
```

### Таблица: `push_log`
История пушей — чтобы не спамить и отслеживать кликабельность.
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
text           TEXT
deep_link      TEXT      -- куда ведёт клик: '?tab=knowledge&item=42'
sent_at        DATETIME
clicked_at     DATETIME  -- NULL если не кликнул
template_id    TEXT      -- какой шаблон использован
```

### Таблица: `event_log`
Аналитика — все действия пользователей.
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER
event          TEXT      -- 'app_open' | 'tab_switch' | 'knowledge_open' | 'payment_start' | ...
meta           TEXT      -- JSON с деталями
ts             DATETIME DEFAULT NOW
```

### Таблица: `monthly_reports`
Кешированные AI-отчёты (чтобы не генерировать повторно).
```sql
id             INTEGER PRIMARY KEY
user_id        INTEGER REFERENCES users
month          TEXT      -- '2026-03'
content        TEXT      -- сгенерированный markdown-отчёт
generated_at   DATETIME
```

---

## 3. API эндпоинты

### Аутентификация
Все `/api/*` — HMAC-аутентификация через Telegram initData (уже реализовано).

---

### Онбординг
```
POST /api/onboarding
  body: { goal, goal_text, current_state, experience_level, goal_90days, zodiac_sign }
  → сохраняет в onboarding_answers
  → вызывает GPT-4o-mini для ai_insight по current_state
  → возвращает: { insight, roadmap_preview }

GET  /api/onboarding/insight
  → возвращает ai_insight из кеша (если уже сгенерирован)
```

### Пользователь
```
GET  /api/me
  → { name, sign, streak, tier, theme, trial_ends, notify_time,
      onboarding_done, goal, experience_level }

POST /api/sign       body: { sign }
POST /api/notify     body: { time }
POST /api/theme      body: { theme }   ← только для paid
POST /api/birth      body: { date, time, place }
```

### Ежедневный контент (бесплатно)
```
GET  /api/today
  → { moon, phase_energy, domains, prediction, color, numerology, retrogrades }
  + log: today_view

GET  /api/moon
  → { phase, sign, degree, lunar_day, aspects }

GET  /api/moon/calendar
  → { months: [...] }

GET  /api/oracle
  → { text, sign, phase }
```

### База знаний (только paid)
```
GET  /api/knowledge
  → список доступных items по unlock_month и goal_tags пользователя
  → фильтр по experience_level

GET  /api/knowledge/:id
  → полный контент item
  + log: knowledge_open

POST /api/knowledge/:id/progress
  body: { action, mood_after }
  → сохраняет в user_progress
```

### 90-дневная программа
```
GET  /api/roadmap
  → { current_day, phase, phase_name, progress_pct,
      next_unlock: { days_left, title } }
  Логика: (now - subscription_started) / 90 × 100
```

### Обратная связь по прогнозу
```
POST /api/feedback
  body: { date, reaction, prognosis_type }
  → сохраняет в daily_feedback
```

### Подписка и оплата
```
GET  /api/subscription
  → { status, trial_ends, paid_until, days_left }

POST /api/subscription/create
  → создаёт платёж в ЮKassa
  → возвращает { payment_url }  ← редирект пользователя

POST /api/subscription/webhook  ← вызывает ЮKassa при успехе
  → обновляет subscriptions, меняет tier='paid'
  → отправляет приветственный пуш

POST /api/subscription/cancel
  → статус 'cancelled', доступ до paid_until
```

### Месячный отчёт (только paid)
```
GET  /api/report/monthly
  → если есть кеш за текущий месяц → возвращает его
  → иначе: собирает данные из event_log + daily_feedback + user_progress
  → вызывает GPT-4o-mini → сохраняет в monthly_reports → возвращает
```

### Пуши (scheduler, внутренний)
```
INTERNAL /scheduler/push/daily
  → для каждого пользователя с notify_time = текущее время:
    выбирает шаблон по (goal, phase, experience_level)
    подставляет переменные {name}, {sign}, {phase}, {tip}
    отправляет через Telegram Bot API
    логирует в push_log

INTERNAL /scheduler/push/reengagement
  → пользователи без визита 3+ дней
    формирует персональный текст по goal из анкеты
    отправляет 1 раз, потом пауза 7 дней
```

### Аналитика (только admin)
```
GET  /api/admin/stats
  → { total_users, active_7d, active_1d, paid_users,
      conversion_rate, avg_streak, top_events,
      feedback_hit_rate, churn_this_month }

GET  /api/admin/knowledge
  → список всех items с просмотрами и completion rate

POST /api/admin/knowledge        body: { ... }   ← создать
PUT  /api/admin/knowledge/:id    body: { ... }   ← обновить
DELETE /api/admin/knowledge/:id                  ← удалить
```

---

## 4. AI-интеграция

### Где используется GPT-4o-mini

| Место | Вход | Выход | Частота |
|---|---|---|---|
| Онбординг-инсайт | current_state (1–2 предложения) | 2–3 предложения инсайта | 1 раз на пользователя |
| Месячный отчёт | поведенческие данные за месяц | 300–500 слов | 1 раз/мес на paid |

### Стоимость
- **До 1000 юзеров:** ~$0.64/мес
- **10 000 юзеров:** ~$6.40/мес

### Кеширование
- Онбординг-инсайт → сохраняется в `onboarding_answers.ai_insight`, повторно не генерируется
- Месячный отчёт → кешируется в `monthly_reports` на весь месяц

### Пуши — без AI
Шаблонная система: `{name}, сегодня {phase} — {tip_by_goal}`.
Матрица: 4 цели × 8 фаз × 3 уровня вовлечённости = 96 шаблонов (аналогично существующим ZODIAC_PHASE_TIPS).

---

## 5. Подписка и оплата (ЮKassa)

### Флоу оплаты
```
1. Пользователь нажимает «Начать 7 дней бесплатно»
2. POST /api/subscription/create
3. Beget/API создаёт платёж в ЮKassa (сумма 299 ₽, тип: recurring)
4. Пользователь → payment_url (страница ЮKassa)
5. Оплата успешна → ЮKassa → POST /api/subscription/webhook
6. tier='paid', paid_until = now + 30 days
7. Уведомление пользователю в боте
```

### Пробный период
- 7 дней: `trial_ends_at = created_at + 7 days`
- В эти 7 дней: tier='trial', доступ как у paid
- На 6-й день: пуш «Завтра заканчивается пробный период»
- После окончания без оплаты: tier='free'

### После отмены
- Доступ сохраняется до `paid_until`
- Данные пользователя сохраняются навсегда (это актив удержания)
- При возобновлении — продолжает с того же места *(открытый вопрос: удалять ли данные по запросу)*

---

## 6. Прогрессивное раскрытие контента

```
День 1–30  (Месяц 1) → unlock_month = 1: базовые уроки нумерологии
День 31–60 (Месяц 2) → unlock_month = 2: глубокая психология отношений
День 61–90 (Месяц 3) → unlock_month = 3: продвинутые практики

Логика разблокировки:
  subscription_day = (now - subscription_started).days
  available_month = min(3, floor(subscription_day / 30) + 1)
  → GET /api/knowledge возвращает items где unlock_month <= available_month
```

### Анонс следующего контента
`GET /api/roadmap` возвращает `next_unlock` — что откроется через N дней.
Используется в UI для создания ожидания («через 14 дней откроется модуль по предназначению»).

---

## 7. 90-дневная программа

```
Фазы:
  1–30  → "Очищение" (базовые практики, осознанность)
  31–60 → "Поиск ресурсов" (психология, паттерны)
  61–90 → "Реализация" (продвинутые практики, синтез)

API: GET /api/roadmap
  → { day: 45, phase: 2, phase_name: "Поиск ресурсов",
      progress_pct: 50, days_in_phase: 15,
      next_unlock: { days_left: 15, title: "Модуль: Синастрия с собой" } }
```

---

## 8. Миграция Railway → Beget

### Почему Beget
- Российский хостинг → нет проблем с оплатой из РФ
- VPS от 250 ₽/мес
- Поддержка Python, PostgreSQL, Redis
- Домен и SSL в одном месте

### План миграции

**Шаг 1 — Подготовка (без остановки)**
```bash
# Экспортировать БД с Railway
railway shell --service selenyx-bot
sqlite3 /data/selenyx.db .dump > backup.sql

# Скопировать на локальный
railway run cat /data/selenyx.db > selenyx.db
```

**Шаг 2 — Настройка Beget VPS**
```bash
# На Beget VPS (Ubuntu):
apt install python3.11 python3.11-venv sqlite3 nginx
# Загрузить код через git
git clone https://github.com/anastasiatrusova204-beep/selenyx.git
# Перенести БД
scp selenyx.db user@beget-vps:/data/selenyx.db
# Установить зависимости
python3.11 -m venv venv && venv/bin/pip install -r requirements.txt
```

**Шаг 3 — Переменные окружения**
```
BOT_TOKEN=...
ADMIN_IDS=...
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
OPENAI_API_KEY=...
DB_PATH=/data/selenyx.db
```

**Шаг 4 — Запуск через systemd**
```ini
# /etc/systemd/system/selenyx.service
[Service]
ExecStart=/path/venv/bin/python3 bot.py
Restart=always
```

**Шаг 5 — Переключение (downtime ~5 мин)**
- Остановить Railway
- Запустить Beget
- Проверить бот

---

## 9. AI-видео с аватаром (Phase 2)

**Концепция:** персональный астролог/психолог в виде AI-видео — «вау-эффект» при открытии контента.

**Инструменты для исследования:**
- [HeyGen](https://heygen.com) — лучшее качество, от $29/мес, 5 мин видео/мес
- [D-ID](https://d-id.com) — от $5.9/мес, хорош для коротких клипов
- [Synthesia](https://synthesia.io) — корпоративный, дорого
- [Hedra](https://hedra.com) — новый, дешевле, качество растёт

**Архитектурная закладка:**
- Таблица `knowledge_items` уже имеет поле `media_url TEXT`
- При добавлении видео — загружать на Beget storage или S3-совместимое хранилище
- В Mini App: если `media_url` заполнен → показывать видео-плеер вместо текста

**Когда делать:** после запуска платной подписки и получения первых 100 платящих пользователей.

---

## 10. Что НЕ строим сейчас

- B2B white-label для других экспертов
- Многоязычность
- Интеграция с календарями
- Голосовые сообщения
- Живые консультации с астрологом
- Реферальная программа
- Публикация в соцсети через нейро-помощника

---

## 11. Порядок разработки

### Спринт 1 — Крючок (приоритет)
- [ ] Переработать онбординг в квиз с 5–7 вопросами
- [ ] Микро-инсайты во время заполнения (по дате рождения, по городу)
- [ ] Интеграция GPT-4o-mini для инсайта по `current_state`
- [ ] Сохранение `onboarding_answers` в БД
- [ ] 90-дневная дорожная карта на экране после онбординга
- [ ] Кнопки «В точку» / «Не про меня» под прогнозом

### Спринт 2 — Привычка
- [ ] Персонализированные пуши по шаблонам (goal × phase)
- [ ] Логика реактивации (3 дня без визита → пуш)
- [ ] Streak-механика (уже частично есть)
- [ ] Недельный дайджест

### Спринт 3 — Деньги
- [ ] Интеграция ЮKassa (recurring payments)
- [ ] Webhook обработчик
- [ ] Пробный период 7 дней
- [ ] Paywall в приложении
- [ ] Выбор темы (light/dark/gold) для paid

### Спринт 4 — База знаний
- [ ] Таблица `knowledge_items` + наполнение контентом
- [ ] API базы знаний с фильтрацией по месяцу подписки
- [ ] UI базы знаний в Mini App
- [ ] Прогресс-трекер по контенту

### Спринт 5 — Синтез
- [ ] Месячный отчёт (GPT-4o-mini + кеш)
- [ ] Аналитика для admin
- [ ] Миграция Railway → Beget

---

## 12. Открытые вопросы (решить до разработки)

1. **Данные при отмене подписки** — удалять или хранить навсегда?
2. **Место хранения видео** (Phase 2) — Beget storage vs Cloudflare R2 vs S3
3. **Имя персонажа-аватара** — реальный персонаж или абстрактный «Selenyx»?
4. **Контент базы знаний** — кто пишет: ты, GPT, приглашённый эксперт?
5. **Push через Telegram vs email** — или оба канала?

---

*Документ обновляется по мере разработки.*
*Следующий шаг: Спринт 1 — переработка онбординга.*
