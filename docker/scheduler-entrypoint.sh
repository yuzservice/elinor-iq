#!/bin/sh
set -e

# Not fatal: without network (e.g. a new package after a failed image build) start with what is installed.
pip install --no-cache-dir -r requirements.txt || echo "pip install failed; continuing with the installed packages."
python manage.py migrate --noinput

interval="${ELINOR_SYNC_INTERVAL_SECONDS:-3600}"

while true; do
  python manage.py refresh_customer_metrics --if-empty || echo "Customer metrics first fill failed; will retry next interval."
  echo "Checking daily customer tiers at $(date -Iseconds)"
  python manage.py refresh_customer_tiers --if-due || echo "Customer tier refresh failed; will retry next interval."
  python manage.py calls_daily --if-due || echo "Call Center daily job failed; will retry next interval."
  python manage.py products_daily --if-due || echo "Products daily job failed; will retry next interval."
  # Stock is off unless PRODUCTS_STOCK_ENABLED=true (owner decision 2026-11-11); the command also refuses when off.
  case "${PRODUCTS_STOCK_ENABLED:-false}" in
    1|true|yes) python manage.py refresh_central_stock || echo "Central stock refresh failed; will retry next interval." ;;
  esac
  echo "Starting scheduled Elinor sync at $(date -Iseconds)"
  python manage.py sync_elinor_hourly || echo "Hourly sync failed; will retry next interval."
  echo "Sleeping ${interval}s until next sync"
  sleep "$interval"
done
