#!/bin/bash
# setup-beget.sh — Автоматическая установка Selenyx на Beget VPS
# Запускать от root: bash setup-beget.sh
# Ubuntu 22.04

set -e  # Остановить при любой ошибке

REPO_URL="https://github.com/anastasiatrusova204-beep/selenyx.git"
APP_DIR="/home/selenyx/app"
DATA_DIR="/data"
LOG_DIR="/var/log/selenyx"
BACKUP_DIR="/home/selenyx/backups"

echo "=== Selenyx — установка на Beget VPS ==="
echo ""

# --- Шаг 1: Обновление системы ---
echo "[1/8] Обновление пакетов..."
apt-get update -qq && apt-get upgrade -y -qq

# --- Шаг 2: Установка зависимостей ---
echo "[2/8] Установка Python, nginx, git, certbot..."
apt-get install -y -qq \
    python3.11 python3.11-venv python3-pip \
    sqlite3 \
    nginx \
    certbot python3-certbot-nginx \
    git \
    curl

# --- Шаг 3: Создать пользователя и директории ---
echo "[3/8] Создание пользователя selenyx и директорий..."
id -u selenyx &>/dev/null || useradd -m -s /bin/bash selenyx
mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR"
chown -R selenyx:selenyx /home/selenyx "$DATA_DIR" "$LOG_DIR"

# --- Шаг 4: Клонировать репозиторий ---
echo "[4/8] Клонирование репозитория..."
if [ -d "$APP_DIR/.git" ]; then
    echo "  Репозиторий уже есть — обновляем..."
    su - selenyx -c "cd $APP_DIR && git pull"
else
    su - selenyx -c "git clone $REPO_URL $APP_DIR"
fi

# --- Шаг 5: Установить Python-зависимости ---
echo "[5/8] Установка Python-зависимостей..."
su - selenyx -c "python3.11 -m venv $APP_DIR/venv"
su - selenyx -c "$APP_DIR/venv/bin/pip install --quiet -r $APP_DIR/requirements.txt"

# --- Шаг 6: Настроить systemd ---
echo "[6/8] Установка systemd-сервиса..."
cp "$APP_DIR/deploy/selenyx.service" /etc/systemd/system/selenyx.service
systemctl daemon-reload
systemctl enable selenyx

# --- Шаг 7: Настроить nginx ---
echo "[7/8] Настройка nginx..."
if [ ! -f /etc/nginx/sites-available/selenyx ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/selenyx
    ln -sf /etc/nginx/sites-available/selenyx /etc/nginx/sites-enabled/selenyx
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    echo "  nginx настроен. Не забудь заменить домен в /etc/nginx/sites-available/selenyx"
else
    echo "  nginx конфиг уже есть — пропускаем"
fi

# --- Шаг 8: Настроить автобэкап ---
echo "[8/8] Настройка автобэкапа (cron)..."
CRON_JOB="0 3 * * * sqlite3 $DATA_DIR/selenyx.db .dump > $BACKUP_DIR/selenyx_\$(date +\%Y\%m\%d).sql && find $BACKUP_DIR -name '*.sql' -mtime +30 -delete"
(crontab -u selenyx -l 2>/dev/null | grep -q "selenyx.db" ) || \
    (crontab -u selenyx -l 2>/dev/null; echo "$CRON_JOB") | crontab -u selenyx -

echo ""
echo "=== Установка завершена ==="
echo ""
echo "Следующие шаги:"
echo "  1. Загрузи БД: scp selenyx_backup.db root@\$(hostname -I | awk '{print \$1}'):$DATA_DIR/selenyx.db"
echo "     Затем: chown selenyx:selenyx $DATA_DIR/selenyx.db"
echo ""
echo "  2. Создай .env:"
echo "     su - selenyx"
echo "     cp $APP_DIR/.env.example $APP_DIR/.env"
echo "     nano $APP_DIR/.env  ← вставь BOT_TOKEN и ADMIN_IDS"
echo ""
echo "  3. Укажи домен в nginx конфиге:"
echo "     nano /etc/nginx/sites-available/selenyx  ← замени YOUR_BEGET_DOMAIN"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  4. Получи SSL-сертификат:"
echo "     certbot --nginx -d ВАШ_ДОМЕН"
echo ""
echo "  5. Запусти бота:"
echo "     systemctl start selenyx"
echo "     systemctl status selenyx"
echo ""
echo "  6. Проверь healthcheck:"
echo "     curl https://ВАШ_ДОМЕН/health"
