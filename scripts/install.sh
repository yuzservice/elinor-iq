#!/usr/bin/env bash
# Ubuntu installer. Asks only for the public domain and the super admin account.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "این اسکریپت را با sudo اجرا کنید:"
  echo "  sudo ./scripts/install.sh"
  exit 1
fi

read -r -p "دامنه (مثال: panel.example.com): " DOMAIN
read -r -p "نام کاربری سوپر ادمین: " ADMIN_USER
read -s -p "رمز سوپر ادمین: " ADMIN_PASSWORD
echo
read -s -p "تکرار رمز: " ADMIN_PASSWORD_REPEAT
echo

DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
DOMAIN="${DOMAIN%%:*}"
DOMAIN="$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')"

if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "دامنه معتبر نیست."
  exit 1
fi
if [[ ! "$ADMIN_USER" =~ ^[A-Za-z0-9._-]{3,150}$ ]]; then
  echo "نام کاربری باید حداقل ۳ حرف و فقط شامل حروف، عدد، نقطه، خط تیره و زیرخط باشد."
  exit 1
fi
if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
  echo "رمز سوپر ادمین باید حداقل ۸ حرف باشد."
  exit 1
fi
if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_REPEAT" ]]; then
  echo "رمز و تکرار آن یکی نیست."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "در حال نصب Docker..."
  apt-get update
  apt-get install -y ca-certificates curl git docker.io docker-compose-v2
  systemctl enable --now docker
fi

secret_key=""
db_password=""
instagram_lines=""
if [[ -f .env ]]; then
  secret_key="$(grep -E '^DJANGO_SECRET_KEY=' .env | head -1 | cut -d= -f2- || true)"
  db_password="$(grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- || true)"
  instagram_lines="$(grep -E '^INSTAGRAM_' .env || true)"
fi
if [[ -z "$secret_key" || "$secret_key" == "change-me-to-a-long-random-string" ]]; then
  secret_key="$(openssl rand -hex 32)"
fi
if [[ -z "$db_password" || "$db_password" == "change-me" ]]; then
  db_password="$(openssl rand -hex 24)"
fi

cat > .env <<EOF
DJANGO_SECRET_KEY=${secret_key}
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=${DOMAIN},localhost,127.0.0.1,backend
CSRF_TRUSTED_ORIGINS=http://${DOMAIN},https://${DOMAIN}

POSTGRES_DB=elinor_iq
POSTGRES_USER=elinor
POSTGRES_PASSWORD=${db_password}
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

ELINOR_API_BASE_URL=https://api.elinorboutique.com/v1
ELINOR_API_USERNAME=
ELINOR_API_PASSWORD=
ELINOR_RATE_LIMIT_PER_MINUTE=45
ELINOR_SYNC_MAX_REQUESTS=900
ELINOR_SYNC_HOURLY_ONLINE_DETAILS_LIMIT=250
ELINOR_SYNC_HOURLY_POS_DAYS=3
ELINOR_SYNC_INTERVAL_SECONDS=3600

HTTP_PORT=80
VITE_API_BASE_URL=/api
EOF
if [[ -n "$instagram_lines" ]]; then
  printf '\n%s\n' "$instagram_lines" >> .env
fi
chmod 600 .env

echo "در حال ساخت و اجرای سرویس‌ها..."
docker compose up -d --build

echo "منتظر آماده شدن برنامه..."
ready=0
for _ in $(seq 1 40); do
  if docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=5)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done
if [[ "$ready" -ne 1 ]]; then
  echo "برنامه به‌موقع بالا نیامد. لاگ را با docker compose logs backend ببینید."
  exit 1
fi

echo "در حال ساخت سوپر ادمین..."
ELINOR_BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USER" \
ELINOR_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
docker compose exec -T \
  -e ELINOR_BOOTSTRAP_ADMIN_USERNAME \
  -e ELINOR_BOOTSTRAP_ADMIN_PASSWORD \
  backend python manage.py create_admin
unset ELINOR_BOOTSTRAP_ADMIN_PASSWORD ADMIN_PASSWORD ADMIN_PASSWORD_REPEAT

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
fi

echo
echo "نصب تمام شد."
echo "ورود: http://${DOMAIN}"
echo "بعد از ورود، در تنظیمات اتصال API الینور و ادمین‌های لایه ۲ را بسازید."
