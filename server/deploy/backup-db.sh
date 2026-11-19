#!/usr/bin/env bash
# 혼자야 Postgres 백업 스크립트 (pg_dump custom format)
#
# 사용법:
#   ./backup-db.sh
#   BACKUP_DIR=/mnt/usb/honjaya KEEP_DAYS=30 ./backup-db.sh
#
# cron 등록 (매일 05:00):
#   0 5 * * * /opt/honjaya/server/deploy/backup-db.sh >> /var/log/honjaya-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/honjaya}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_NAME="${DB_NAME:-honjaya}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/${DB_NAME}-${timestamp}.dump"

cd "$COMPOSE_DIR"

if ! docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$target"; then
  echo "백업 실패: pg_dump 실행 오류 ($target)" >&2
  rm -f "$target"
  exit 1
fi

if [ ! -s "$target" ]; then
  echo "백업 실패: 결과 파일이 비어 있습니다 ($target)" >&2
  rm -f "$target"
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.dump" -type f -mtime "+${KEEP_DAYS}" -delete

echo "백업 완료: $target ($(du -h "$target" | cut -f1))"
echo "복구 방법: docker compose exec -T db pg_restore -U $DB_USER -d $DB_NAME --clean --if-exists < $target"
