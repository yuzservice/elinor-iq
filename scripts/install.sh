#!/usr/bin/env bash
set -euo pipefail
echo "ELINOR IQ v2 — install foundation"
echo
echo "This script is a placeholder for future Ubuntu Server installation."
echo "For local development:"
echo "  1. cp .env.example .env"
echo "  2. fill ELINOR_API_USERNAME / ELINOR_API_PASSWORD"
echo "  3. docker compose up -d"
echo "  4. docker compose exec backend python manage.py create_admin --username admin --password 'choose-a-password'"
echo "  5. docker compose exec backend python manage.py sync_elinor_bootstrap"
echo "  6. open http://localhost:8080"
