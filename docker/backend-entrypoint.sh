#!/bin/sh
set -e
pip install --no-cache-dir -r requirements.txt
python manage.py makemigrations --noinput
python manage.py migrate --noinput
exec python manage.py runserver 0.0.0.0:8000
