#!/usr/bin/env bash
# Issue or renew the Let's Encrypt certificate for the domain in .env.
set -euo pipefail

cd "$(dirname "$0")/.."

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

domain=""
if [[ -f .env ]]; then
  domain="$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- || true)"
  if [[ -z "$domain" ]]; then
    hosts="$(grep -E '^DJANGO_ALLOWED_HOSTS=' .env | head -1 | cut -d= -f2- || true)"
    domain="${hosts%%,*}"
  fi
fi

if [[ -z "$domain" || "$domain" == "localhost" || "$domain" == "127.0.0.1" ]]; then
  echo "دامنه‌ای برای SSL تنظیم نشده است."
  exit 0
fi

set_env DOMAIN "$domain"
set_env HTTP_PORT 80
set_env HTTPS_PORT 443

echo "در حال گرفتن گواهی SSL برای ${domain}..."
docker compose up -d nginx
docker compose --profile ssl run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name "$domain" \
  -d "$domain" \
  --agree-tos \
  --register-unsafely-without-email \
  --non-interactive \
  --keep-until-expiring

set_env DJANGO_SECURE_COOKIES true
docker compose up -d --force-recreate nginx backend

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

echo "SSL آماده است: https://${domain}"
