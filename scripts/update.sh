#!/usr/bin/env bash
# Pull the latest code and recreate the running stack. Does not ask questions.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "این اسکریپت را با sudo اجرا کنید:"
  echo "  sudo ./scripts/update.sh"
  exit 1
fi

echo "در حال دریافت نسخه جدید..."
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  sudo -u "$SUDO_USER" git -C "$root" pull --ff-only
else
  git pull --ff-only
fi

echo "در حال به‌روزرسانی سرویس‌ها..."
docker compose up -d --build

echo "آپدیت تمام شد."
