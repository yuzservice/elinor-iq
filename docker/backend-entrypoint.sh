#!/bin/sh
set -e

debug="$(printf '%s' "${DJANGO_DEBUG:-false}" | tr '[:upper:]' '[:lower:]')"
case "$debug" in
  1|true|yes)
    pip install --no-cache-dir -r requirements.txt
    python manage.py makemigrations --noinput
    python manage.py migrate --noinput
    exec python manage.py runserver 0.0.0.0:8000
    ;;
esac

python manage.py migrate --noinput
workers="${GUNICORN_WORKERS:-3}"
threads="${GUNICORN_THREADS:-2}"
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "$workers" \
  --threads "$threads" \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
