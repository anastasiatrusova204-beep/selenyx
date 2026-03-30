# Миграция Railway → Beget VPS

> Создано: 2026-03-30
> Статус: Готово к выполнению

---

## Почему Beget

| | Railway | Beget VPS |
|--|---------|-----------|
| Цена | ~$5/мес | 250–500 ₽/мес |
| Оплата из РФ | ❌ проблемы | ✅ карта РФ |
| ЮKassa интеграция | сложно | ✅ нативно |
| Контроль | ограниченный | полный root |
| БД backup | Railway Volume | ручной cron |

---

## Шаг 1 — Создать VPS на Beget

1. Зайти на beget.com → VPS → тариф **Start** (250 ₽/мес, 1 CPU, 1 Gb RAM)
2. Выбрать образ: **Ubuntu 22.04**
3. Записать: IP-адрес VPS, root-пароль

---

## Шаг 2 — Экспортировать БД с Railway (локально)

```bash
# Подключиться к Railway и сделать дамп
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway shell --service selenyx-bot

# Внутри контейнера:
sqlite3 /data/selenyx.db .dump > /tmp/backup.sql
cat /data/selenyx.db | base64 > /tmp/db_base64.txt
exit

# Скачать файл БД (выполнить локально):
RAILWAY_TOKEN=da21a856-758c-459b-aa21-bc6d6f74f8f7 ~/bin/railway run --service selenyx-bot "cat /data/selenyx.db" > selenyx_backup.db
```

---

## Шаг 3 — Настроить Beget VPS

```bash
# Подключиться по SSH
ssh root@ВАШ_IP_BEGET

# Обновить систему
apt update && apt upgrade -y

# Установить зависимости
apt install -y python3.11 python3.11-venv python3-pip sqlite3 nginx certbot python3-certbot-nginx git

# Создать пользователя для бота
useradd -m -s /bin/bash selenyx

# Создать директории
mkdir -p /home/selenyx/app /data /var/log/selenyx
chown selenyx:selenyx /home/selenyx/app /data /var/log/selenyx
```

---

## Шаг 4 — Загрузить код и БД

```bash
# Переключиться на пользователя selenyx
su - selenyx

# Клонировать репозиторий
cd /home/selenyx
git clone https://github.com/anastasiatrusova204-beep/selenyx.git app
cd app

# Создать виртуальное окружение
python3.11 -m venv venv
venv/bin/pip install -r requirements.txt

# Выйти из пользователя selenyx
exit
```

```bash
# Загрузить БД (выполнить локально):
scp selenyx_backup.db root@ВАШ_IP_BEGET:/data/selenyx.db
ssh root@ВАШ_IP_BEGET "chown selenyx:selenyx /data/selenyx.db"
```

---

## Шаг 5 — Создать .env на Beget

```bash
su - selenyx
nano /home/selenyx/app/.env
```

Содержимое файла (заменить значения):
```
BOT_TOKEN=токен_от_BotFather
ADMIN_IDS=958560798
DB_PATH=/data/selenyx.db
DEMO_MODE=false
PORT=8080

# Добавить после настройки ЮKassa:
# YOOKASSA_SHOP_ID=...
# YOOKASSA_SECRET_KEY=...

# Добавить после подключения GPT:
# OPENAI_API_KEY=...
```

---

## Шаг 6 — Установить systemd сервис

```bash
# Скопировать файл сервиса
cp /home/selenyx/app/deploy/selenyx.service /etc/systemd/system/selenyx.service

# Включить и запустить
systemctl daemon-reload
systemctl enable selenyx
systemctl start selenyx

# Проверить статус
systemctl status selenyx
journalctl -u selenyx -f
```

---

## Шаг 7 — Настроить nginx и SSL

```bash
# Скопировать конфиг nginx
cp /home/selenyx/app/deploy/nginx.conf /etc/nginx/sites-available/selenyx

# Заменить YOUR_BEGET_DOMAIN на реальный домен
nano /etc/nginx/sites-available/selenyx

# Включить сайт
ln -s /etc/nginx/sites-available/selenyx /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Получить SSL-сертификат
certbot --nginx -d ВАШ_ДОМЕН
```

---

## Шаг 8 — Проверить работу

```bash
# Проверить что бот жив
curl https://ВАШ_ДОМЕН/health

# Посмотреть логи
tail -f /var/log/selenyx/bot.log

# Проверить БД
sqlite3 /data/selenyx.db "SELECT COUNT(*) FROM users;"
```

---

## Шаг 9 — Переключение (downtime ~5 мин)

1. Открыть Railway → Deployments → **Pause** сервис
2. Убедиться что Beget работает (шаг 8)
3. Если всё ок — удалить Railway сервис (или оставить как резерв)

> ⚠️ Не удаляй Railway Volume пока не убедишься что Beget работает стабильно 2–3 дня.

---

## Настройка автобэкапа БД

```bash
# Добавить cron задачу
crontab -e

# Бэкап каждую ночь в 03:00
0 3 * * * sqlite3 /data/selenyx.db .dump > /home/selenyx/backups/selenyx_$(date +\%Y\%m\%d).sql
0 3 * * * find /home/selenyx/backups -name "*.sql" -mtime +30 -delete
```

```bash
# Создать директорию для бэкапов
mkdir -p /home/selenyx/backups
chown selenyx:selenyx /home/selenyx/backups
```

---

## Проблемы и решения

| Проблема | Решение |
|----------|---------|
| `TelegramConflictError` | Railway всё ещё работает — остановить его |
| Бот не стартует | Проверить `.env` — все переменные заполнены? |
| API недоступен | `systemctl status selenyx` — смотреть ошибки |
| БД пустая | Проверить `DB_PATH=/data/selenyx.db` в `.env` |
| SSL не работает | Certbot: `certbot renew --dry-run` |

---

## После миграции — добавить в .env

Когда будешь подключать ЮKassa и OpenAI:

```
YOOKASSA_SHOP_ID=ваш_shop_id
YOOKASSA_SECRET_KEY=ваш_secret_key
OPENAI_API_KEY=sk-...
```

---

## Статус

- [ ] Шаг 1: VPS создан на Beget
- [ ] Шаг 2: БД экспортирована с Railway
- [ ] Шаг 3: VPS настроен (Python, nginx, git)
- [ ] Шаг 4: Код загружен, зависимости установлены
- [ ] Шаг 5: .env создан
- [ ] Шаг 6: systemd сервис работает
- [ ] Шаг 7: nginx + SSL работает
- [ ] Шаг 8: healthcheck прошёл
- [ ] Шаг 9: Railway остановлен
