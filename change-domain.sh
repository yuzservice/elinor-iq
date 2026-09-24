#!/usr/bin/env bash
# Change the public domain and issue a certificate for it:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/change-domain.sh)"
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/yuzservice/elinor-iq/main/change-domain.sh"
TARGET="/opt/elinor-iq"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash -c "$(curl -fsSL "$RAW_URL")"
fi

if [[ ! -d "$TARGET/.git" || ! -f "$TARGET/.env" ]]; then
  echo "نصب پیدا نشد. اول install.sh را اجرا کنید."
  exit 1
fi
cd "$TARGET"

read -r -p "دامنه جدید (مثال: panel.example.com): " DOMAIN
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
DOMAIN="${DOMAIN%%:*}"
DOMAIN="$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')"

if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "دامنه معتبر نیست."
  exit 1
fi

set_env() {
  key="$1"
  value="$2"
  tmp="$(mktemp)"
  awk -F= -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $1 == k { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' .env > "$tmp"
  mv "$tmp" .env
}

set_env DOMAIN "$DOMAIN"
set_env DJANGO_ALLOWED_HOSTS "${DOMAIN},localhost,127.0.0.1,backend"
set_env CSRF_TRUSTED_ORIGINS "http://${DOMAIN},https://${DOMAIN}"
set_env HTTP_PORT 80
set_env HTTPS_PORT 443

echo "در حال گرفتن گواهی برای ${DOMAIN}..."
./scripts/ensure-https.sh
echo "دامنه عوض شد: https://${DOMAIN}"
