# Миграция Railway → Beget VPS

> Обновлён: 2026-04-01
> Статус: Готово к выполнению. Скрипты автоматизации созданы.

---

## Почему Beget

| | Railway | Beget VPS |
|--|---------|-----------|
| Цена | ~$5/мес ($60/год) | 250–500 ₽/мес |
| Оплата из РФ | ❌ проблемы | ✅ карта РФ |
| ЮKassa интеграция | сложно | ✅ нативно |
| Контроль над сервером | ограниченный | полный root |
| БД backup | Railway Volume | cron (`deploy/backup.sh`) |
| SSL | автоматически | certbot (бесплатно) |

---

## Вариант A — Автоматически (рекомендуется)

### Шаг 1 — Создать VPS на Beget

1. [beget.com](https://beget.com) → VPS → тариф **Start** (250 ₽/мес, 1 CPU, 1 Gb RAM)
2. Образ: **Ubuntu 22.04**
3. Записать: IP-адрес VPS, root-пароль

### Шаг 2 — Экспортировать БД с Railway

```bash
# Выполнить локально:
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway shell --service selenyx-bot

# Внутри контейнера Railway:
sqlite3 /data/selenyx.db .dump > /tmp/backup.sql
exit

# Скачать БД локально:
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway run --service selenyx-bot \
    "cat /data/selenyx.db" > selenyx_backup.db
```

### Шаг 3 — Запустить автоустановку на VPS

```bash
# Подключиться к VPS:
ssh root@ВАШ_IP_BEGET

# Скачать и запустить setup-скрипт:
curl -fsSL https://raw.githubusercontent.com/anastasiatrusova204-beep/selenyx/main/deploy/setup-beget.sh | bash
```

Или клонировать репозиторий и запустить локально:

```bash
git clone https://github.com/anastasiatrusova204-beep/selenyx.git /tmp/selenyx-setup
bash /tmp/selenyx-setup/deploy/setup-beget.sh
```

Скрипт сам: обновит систему, установит Python 3.11 / nginx / certbot / git, создаст пользователя `selenyx`, клонирует репозиторий, установит зависимости, настроит systemd и автобэкап.

### Шаг 4 — Загрузить БД

```bash
# Выполнить локально после Шага 2:
scp selenyx_backup.db root@ВАШ_IP_BEGET:/data/selenyx.db
ssh root@ВАШ_IP_BEGET "chown selenyx:selenyx /data/selenyx.db"
```

### Шаг 5 — Создать .env

```bash
ssh root@ВАШ_IP_BEGET
su - selenyx
cp /home/selenyx/app/.env.example /home/selenyx/app/.env
nano /home/selenyx/app/.env
```

Заполнить:
```
BOT_TOKEN=токен_от_BotFather
ADMIN_IDS=958560798
DB_PATH=/data/selenyx.db
DEMO_MODE=false
PORT=8080
```

### Шаг 6 — Настроить домен и SSL

```bash
# Заменить домен в nginx конфиге:
nano /etc/nginx/sites-available/selenyx
# Найти YOUR_BEGET_DOMAIN → заменить на реальный домен (например: api.selenyx.ru)

# Проверить и перезагрузить nginx:
nginx -t && systemctl reload nginx

# Получить SSL-сертификат (бесплатно):
certbot --nginx -d ВАШ_ДОМЕН
```

### Шаг 7 — Запустить и проверить

```bash
systemctl start selenyx
systemctl status selenyx

# Healthcheck:
curl https://ВАШ_ДОМЕН/health
# Ожидаемый ответ: "ok"

# Логи:
journalctl -u selenyx -f
```

### Шаг 8 — Переключение (downtime ~5 мин)

1. Убедиться что Beget работает (Шаг 7 ✅)
2. Railway → Deployments → **Pause** сервис
3. Если всё стабильно 2–3 дня → удалить Railway сервис

> ⚠️ Не удаляй Railway Volume пока не убедишься что Beget работает стабильно.

---

## Вариант B — Вручную (пошагово)

Если хочешь контролировать каждый шаг — смотри команды внутри `deploy/setup-beget.sh`.
Каждый блок прокомментирован и разбит на 8 шагов.

---

## Обновление кода после деплоя

При каждом изменении в репозитории:

```bash
ssh root@ВАШ_IP_BEGET
bash /home/selenyx/app/deploy/update.sh
```

Скрипт: git pull → pip install → systemctl restart selenyx.

---

## Резервное копирование

Бэкап настраивается автоматически при `setup-beget.sh` (cron, 03:00 ночи).

Запустить вручную:
```bash
su - selenyx -c "bash /home/selenyx/app/deploy/backup.sh"
```

Бэкапы хранятся в `/home/selenyx/backups/` — последние 30 дней.

---

## Проблемы и решения

| Проблема | Решение |
|----------|---------|
| `TelegramConflictError` | Railway всё ещё работает — остановить его (`Pause` в дашборде) |
| Бот не стартует | `journalctl -u selenyx -n 50` — смотреть ошибку |
| API недоступен | `systemctl status selenyx` + проверить `.env` |
| БД пустая | Проверить `DB_PATH=/data/selenyx.db` в `.env` + права `chown selenyx:selenyx /data/selenyx.db` |
| SSL не работает | `certbot renew --dry-run` + `nginx -t` |
| nginx 502 | Бот не запущен: `systemctl start selenyx` |
| `Permission denied` на `/data` | `chown -R selenyx:selenyx /data` |

---

## Файлы деплоя

| Файл | Назначение |
|------|-----------|
| `deploy/setup-beget.sh` | Автоматическая установка на чистый VPS |
| `deploy/update.sh` | Обновление кода и перезапуск |
| `deploy/backup.sh` | Резервное копирование БД (вызывается cron) |
| `deploy/nginx.conf` | Конфиг nginx (reverse proxy + SSL + gzip) |
| `deploy/selenyx.service` | systemd-сервис (автозапуск после перезагрузки) |

---

## Статус

- [ ] Шаг 1: VPS создан на Beget (Start, Ubuntu 22.04)
- [ ] Шаг 2: БД экспортирована с Railway → `selenyx_backup.db`
- [ ] Шаг 3: `setup-beget.sh` выполнен успешно
- [ ] Шаг 4: БД загружена в `/data/selenyx.db`
- [ ] Шаг 5: `.env` создан и заполнен
- [ ] Шаг 6: nginx настроен, SSL получен
- [ ] Шаг 7: `curl https://домен/health` → "ok"
- [ ] Шаг 8: Railway остановлен
