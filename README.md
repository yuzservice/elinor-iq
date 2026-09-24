# ELINOR IQ v2

Internal retail intelligence and management platform for Elinor.

This is a complete rewrite. It is intentionally small: one Docker stack, PostgreSQL, secure internal login, a premium RTL interface, and a safe 3-month sync from the documented Elinor API.

## Requirements

- Docker
- Docker Compose

No local PostgreSQL, Python virtualenv, or Node setup is required.

## Start

```bash
cp .env.example .env
```

Set at least:

- `DJANGO_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `ELINOR_API_USERNAME`
- `ELINOR_API_PASSWORD`

Then:

```bash
docker compose up -d
docker compose exec backend python manage.py create_admin --username admin --password 'choose-a-password'
docker compose exec backend python manage.py sync_elinor_bootstrap
```

Open [http://localhost:8080](http://localhost:8080)

## Environment

| Variable | Purpose |
|---|---|
| `ELINOR_API_BASE_URL` | Documented base: `https://api.elinorboutique.com/v1` |
| `ELINOR_API_USERNAME` | Sanctum admin username with `read_customer`, `read_product`, `read_order` |
| `ELINOR_API_PASSWORD` | Admin password. Never shown in the UI. |
| `ELINOR_RATE_LIMIT_PER_MINUTE` | Client-side ceiling. Default `45` to stay under the documented 60/min throttle. |
| `VITE_API_BASE_URL` | Frontend API prefix. Default `/api` |

## Elinor API integration

Read-only. The client uses the documented endpoints:

- `POST /v1/admin/login`
- `GET /v1/admin/orders_light` with `start_date` / `end_date` unix timestamps
- `GET /v1/admin/orders/{id}` for items and details
- `GET /v1/admin/customers/{id}` for customers referenced by those orders
- `GET /v1/admin/products/{id}` for products/variants required by those items
- `GET /v1/admin/mini_orders` with `start_date` / `end_date` (`YYYY-MM-DD`) for POS sales
- `GET /v1/admin/mini_orders/{id}` for POS line items

Bootstrap window: approximately the last **92 days**.

Recent sync uses a 1-day overlap from the last seen `created_at`, as the PDF recommends.

Hourly sync (Docker `scheduler` service):

```bash
docker compose up -d scheduler
docker compose exec backend python manage.py sync_elinor_hourly
docker compose exec backend python manage.py sync_elinor_pos
```

Every hour (default `3600` seconds) the scheduler runs `sync_elinor_hourly`, which refreshes:

1. recent online orders (`orders_light`)
2. pending online order details (batch limit)
3. recent POS sales (`mini_orders` + detail items)
4. customer order stats (online + POS)

## Known API limitations

- There is no first-class `updated_at` incremental sync.
- `orders_light` filters `created_at` at **day** precision, not seconds.
- Status changes on older orders are not visible unless that order is fetched again.
- Throttle responses may arrive as HTTP **422**, not 429.
- Documented rate limits: about **60 requests/minute** and a separate **1000 requests/day/IP** limiter on some routes.
- There are **no webhooks**.
- POS sales sync uses `mini_orders`; there is no lightweight POS list endpoint like `orders_light`.
- `quantity` on variants is main-store balance only and is treated as incomplete.

## Development workflow

```bash
docker compose up -d
docker compose logs -f backend frontend
docker compose exec backend pytest
docker compose exec frontend npm test
```

## Project structure

```text
backend/     Django modular monolith
frontend/    React + Vite + TypeScript
docker/      Dockerfiles and nginx
scripts/     future Ubuntu install/update placeholders
backups/     future PostgreSQL backup location
```

## Authentication

Internal only. No public registration. Current role: `admin`.

Future roles (`manager`, `analyst`, `staff`) exist on the user model but are not enforced yet.

## Smart Direct / Instagram

Webhook and messaging setup: [docs/SMART_DIRECT_INSTAGRAM.md](docs/SMART_DIRECT_INSTAGRAM.md)

Public callback format:

```text
https://<your-public-host>/api/smart-direct/instagram/webhook/
```
