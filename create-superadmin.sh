#!/usr/bin/env bash
# Creates a super admin and checks the password inside Django.
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/create-superadmin.sh)"
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/yuzservice/elinor-iq/main/create-superadmin.sh"
TARGET="/opt/elinor-iq"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash -c "$(curl -fsSL "$RAW_URL")"
fi

if [[ ! -d "$TARGET/.git" ]]; then
  echo "نصب پیدا نشد."
  exit 1
fi
cd "$TARGET"

read -r -p "نام کاربری سوپر ادمین: " ADMIN_USER
read -s -p "رمز عبور: " ADMIN_PASSWORD
echo
read -s -p "تکرار رمز: " ADMIN_PASSWORD_REPEAT
echo

if [[ ! "$ADMIN_USER" =~ ^[A-Za-z0-9._-]{3,150}$ ]]; then
  echo "نام کاربری فقط حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد."
  exit 1
fi
if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
  echo "رمز باید حداقل ۸ حرف باشد."
  exit 1
fi
if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_REPEAT" ]]; then
  echo "رمز و تکرار آن یکی نیست."
  exit 1
fi

docker compose exec -T \
  -e ELINOR_BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USER" \
  -e ELINOR_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  backend python manage.py create_admin

docker compose exec -T \
  -e ELINOR_BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USER" \
  -e ELINOR_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  backend python manage.py shell -c 'import os; from django.contrib.auth import authenticate; ok=authenticate(username=os.environ["ELINOR_BOOTSTRAP_ADMIN_USERNAME"], password=os.environ["ELINOR_BOOTSTRAP_ADMIN_PASSWORD"]); print("CHECK", "OK" if ok else "FAIL")'

unset ADMIN_PASSWORD ADMIN_PASSWORD_REPEAT
echo "اگر CHECK OK بود، با همان نام کاربری و رمز در سایت وارد شوید."
