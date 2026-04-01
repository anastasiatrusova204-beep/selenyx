#!/bin/bash
# backup.sh — Резервное копирование БД Selenyx
# Запускать от selenyx: bash deploy/backup.sh
# Cron: 0 3 * * * /home/selenyx/app/deploy/backup.sh

DATA_DIR="/data"
BACKUP_DIR="/home/selenyx/backups"
DB="$DATA_DIR/selenyx.db"
DATE=$(date +%Y%m%d_%H%M)

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
    echo "Ошибка: $DB не найден"
    exit 1
fi

# Создать бэкап SQL-дампом (читаемый формат)
sqlite3 "$DB" .dump > "$BACKUP_DIR/selenyx_${DATE}.sql"

# Создать бинарную копию (для быстрого восстановления)
cp "$DB" "$BACKUP_DIR/selenyx_${DATE}.db"

# Удалить бэкапы старше 30 дней
find "$BACKUP_DIR" -name "selenyx_*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "selenyx_*.db" -mtime +30 -delete

# Статистика
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/selenyx_${DATE}.sql" | cut -f1)
USERS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")
BACKUPS_COUNT=$(ls "$BACKUP_DIR"/selenyx_*.sql 2>/dev/null | wc -l)

echo "[$(date)] Бэкап создан: selenyx_${DATE}.sql (${BACKUP_SIZE}), пользователей: ${USERS}, хранится бэкапов: ${BACKUPS_COUNT}"
