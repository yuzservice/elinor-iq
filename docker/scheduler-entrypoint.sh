#!/bin/sh
set -e

pip install --no-cache-dir -r requirements.txt
python manage.py migrate --noinput

interval="${ELINOR_SYNC_INTERVAL_SECONDS:-3600}"

while true; do
  echo "Starting scheduled Elinor sync at $(date -Iseconds)"
  python manage.py sync_elinor_hourly || echo "Hourly sync failed; will retry next interval."
  echo "Sleeping ${interval}s until next sync"
  sleep "$interval"
done
