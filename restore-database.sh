#!/usr/bin/env bash
# Restores backups/elinor_iq.dump or /tmp/elinor_iq.dump into the running stack.
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/restore-database.sh)"
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/yuzservice/elinor-iq/main/restore-database.sh"
TARGET="/opt/elinor-iq"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash -c "$(curl -fsSL "$RAW_URL")"
fi

if [[ ! -d "$TARGET/.git" ]]; then
  echo "نصب پیدا نشد. اول install.sh را اجرا کنید."
  exit 1
fi
cd "$TARGET"
mkdir -p backups

if [[ -f /tmp/elinor_iq.dump ]]; then
  mv /tmp/elinor_iq.dump backups/elinor_iq.dump
fi
if [[ ! -f backups/elinor_iq.dump ]]; then
  echo "فایل بکاپ پیدا نشد. اول آن را در /tmp/elinor_iq.dump کپی کنید."
  exit 1
fi

echo "در حال توقف سرویس‌ها..."
docker compose stop backend scheduler

echo "در حال جایگزینی دیتابیس..."
docker compose exec -T postgres psql -U elinor -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'elinor_iq' AND pid <> pg_backend_pid();"
docker compose exec -T postgres dropdb -U elinor --if-exists elinor_iq
docker compose exec -T postgres createdb -U elinor elinor_iq
docker compose exec -T postgres pg_restore -U elinor -d elinor_iq --no-owner --no-acl --exit-on-error < backups/elinor_iq.dump

echo "در حال راه‌اندازی دوباره..."
docker compose up -d

echo "انتقال دیتابیس تمام شد."
