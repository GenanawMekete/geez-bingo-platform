#!/bin/bash

# Geez Bingo Backup Script
set -e

echo "💾 Starting backup process..."

# Timestamp for backup files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups/geez-bingo_$TIMESTAMP"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL database
echo "🗄️ Backing up PostgreSQL database..."
docker-compose exec -T postgres pg_dump -U postgres -d geezbingo > $BACKUP_DIR/database.sql

# Backup Redis data
echo "🔴 Backing up Redis data..."
docker-compose exec -T redis redis-cli --rdb /data/dump.rdb
docker cp $(docker-compose ps -q redis):/data/dump.rdb $BACKUP_DIR/redis.rdb

# Backup uploads
echo "📁 Backing up uploads..."
tar -czf $BACKUP_DIR/uploads.tar.gz backend/uploads/

# Backup logs
echo "📝 Backing up logs..."
tar -czf $BACKUP_DIR/logs.tar.gz backend/logs/ telegram-bot/logs/

# Backup configurations
echo "⚙️ Backing up configurations..."
cp .env $BACKUP_DIR/
cp docker-compose.yml $BACKUP_DIR/
cp -r nginx/ $BACKUP_DIR/nginx/

# Create backup archive
echo "📦 Creating backup archive..."
tar -czf /backups/geez-bingo_backup_$TIMESTAMP.tar.gz -C /backups "geez-bingo_$TIMESTAMP"

# Cleanup temporary directory
rm -rf $BACKUP_DIR

# Remove old backups (keep last 7 days)
echo "🧹 Cleaning up old backups..."
find /backups -name "geez-bingo_backup_*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: /backups/geez-bingo_backup_$TIMESTAMP.tar.gz"

# Optional: Upload to cloud storage
# echo "☁️ Uploading to cloud storage..."
# rclone copy /backups/geez-bingo_backup_$TIMESTAMP.tar.gz remote:backups/
