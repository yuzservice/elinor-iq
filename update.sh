#!/usr/bin/env bash
# Updated with:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/production/update.sh)"
# Deploys only the `production` branch (what the server runs). `main` is development.
set -euo pipefail

DEPLOY_BRANCH="production"
RAW_URL="https://raw.githubusercontent.com/yuzservice/elinor-iq/${DEPLOY_BRANCH}/update.sh"
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
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/$DEPLOY_BRANCH"

# حذف index.html قبلی تا بیلد جدید فرانت‌اند حتماً جایگزین شود
rm -f frontend/dist/index.html

echo "در حال به‌روزرسانی سرویس‌ها..."
if ! docker compose up -d --build --force-recreate; then
  echo "ساخت ایمیج از داکرهاب ناموفق بود. سرویس‌ها با ایمیج‌های موجود دوباره بالا می‌آیند..."
  docker compose up -d --force-recreate --no-build --pull never
fi

echo "در حال انتظار برای تکمیل بیلد فرانت‌اند..."
for i in $(seq 1 60); do
  if [[ -f frontend/dist/index.html ]]; then
    break
  fi
  sleep 2
done

# ری‌استارت nginx برای اطمینان از اتصال به inode جدید پوشه frontend/dist
docker compose restart nginx

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
