#!/bin/bash
BACKUP_DIR="/var/www/expert-system/backups"
mkdir -p "$BACKUP_DIR"
cp /var/www/expert-system/backend/knowledge.db "$BACKUP_DIR/knowledge_$(date +%Y%m%d_%H%M%S).db"
cp /var/www/expert-system/backend/models.json "$BACKUP_DIR/models_$(date +%Y%m%d_%H%M%S).json"
# 只保留最近30个备份
ls -t "$BACKUP_DIR"/knowledge_*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
ls -t "$BACKUP_DIR"/models_*.json 2>/dev/null | tail -n +31 | xargs -r rm -f
