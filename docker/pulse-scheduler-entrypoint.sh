#!/bin/sh
# Elinor Pulse jobs, separate from the main scheduler so Zernio delays never hold up the sales sync.
# Never migrates: the backend and the main scheduler apply migrations; this loop waits for them.
set -e

pip install --no-cache-dir -r requirements.txt

until python manage.py migrate --check >/dev/null 2>&1; do
  echo "Pulse: waiting for migrations to be applied"
  sleep 30
done

interval="${PULSE_SYNC_INTERVAL_SECONDS:-900}"

while true; do
  python manage.py pulse_sync --if-due || echo "Pulse sync failed; will retry next interval."
  python manage.py pulse_match_products --if-due || echo "Pulse product match failed; will retry next interval."
  python manage.py pulse_snapshot --if-due || echo "Pulse snapshot failed; will retry next interval."
  python manage.py pulse_refresh_covers --if-due || echo "Pulse cover refresh failed; will retry next interval."
  python manage.py pulse_backfill_snapshots --if-due || echo "Pulse snapshot backfill failed; will retry next interval."
  python manage.py pulse_daily_brief --if-due || echo "Pulse daily brief failed; will retry next interval."
  sleep "$interval"
done
