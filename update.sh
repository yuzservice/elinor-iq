#!/usr/bin/env bash
# Updated with:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/update.sh)"
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/yuzservice/elinor-iq/main/update.sh"
TARGET="/opt/elinor-iq"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash -c "$(curl -fsSL "$RAW_URL")"
fi

if [[ ! -d "$TARGET/.git" ]]; then
  echo "نصب پیدا نشد. اول install.sh را اجرا کنید."
  exit 1
fi
cd "$TARGET"

echo "در حال دریافت نسخه جدید..."
git fetch origin main
git reset --hard origin/main

echo "در حال به‌روزرسانی سرویس‌ها..."
docker compose up -d --build

echo "آپدیت تمام شد."
