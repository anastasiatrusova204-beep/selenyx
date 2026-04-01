#!/bin/bash
# update.sh — Обновление кода Selenyx на Beget VPS
# Запускать от root или selenyx: bash deploy/update.sh
# Делает: git pull → pip install → restart

set -e

APP_DIR="/home/selenyx/app"

echo "=== Selenyx — обновление кода ==="

# Убедиться что запускаем из правильного места
if [ ! -f "$APP_DIR/bot.py" ]; then
    echo "Ошибка: $APP_DIR/bot.py не найден. Запусти setup-beget.sh сначала."
    exit 1
fi

# Git pull
echo "[1/3] Получение изменений из репозитория..."
su - selenyx -c "cd $APP_DIR && git pull"

# Установить новые зависимости (если requirements.txt изменился)
echo "[2/3] Обновление зависимостей..."
su - selenyx -c "$APP_DIR/venv/bin/pip install --quiet -r $APP_DIR/requirements.txt"

# Перезапустить сервис
echo "[3/3] Перезапуск selenyx..."
systemctl restart selenyx
sleep 3

# Проверить статус
if systemctl is-active --quiet selenyx; then
    echo ""
    echo "✓ Selenyx запущен успешно"
    echo "  Логи: journalctl -u selenyx -f"
    echo "  Healthcheck: curl https://ВАШ_ДОМЕН/health"
else
    echo ""
    echo "✗ Selenyx не запустился — смотри логи:"
    journalctl -u selenyx --no-pager -n 30
    exit 1
fi
