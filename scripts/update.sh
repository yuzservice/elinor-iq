#!/usr/bin/env bash
set -euo pipefail
echo "ELINOR IQ v2 — update foundation"
echo
echo "Future Ubuntu update flow:"
echo "  git pull"
echo "  docker compose build"
echo "  docker compose up -d"
echo "  docker compose exec backend python manage.py migrate"
