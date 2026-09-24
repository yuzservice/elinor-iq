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
if ! docker compose up -d --build --force-recreate; then
  echo "ساخت ایمیج از داکرهاب ناموفق بود. سرویس‌ها با ایمیج‌های موجود دوباره بالا می‌آیند..."
  docker compose up -d --force-recreate --no-build --pull never
fi

domain=""
if [[ -f .env ]]; then
  domain="$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- || true)"
fi
cert="docker/certbot/conf/live/${domain}/fullchain.pem"
if [[ -n "$domain" && -f "$cert" ]]; then
  echo "گواهی SSL برای ${domain} موجود است و دوباره گرفته نمی‌شود."
else
  ./scripts/ensure-https.sh
fi

echo "آپدیت تمام شد."
