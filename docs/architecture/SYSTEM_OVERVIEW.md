# ELINOR IQ V2 — System Architecture Overview

**Document status:** Verified against source code and configuration files.  
**Location:** `docs/architecture/SYSTEM_OVERVIEW.md`  
**Last updated:** 2026-10-22  

---

## 1. Executive Summary & Purpose

ELINOR IQ V2 is a unified retail intelligence, customer analytics, and multi-channel reporting platform built for Elinor Boutique. It integrates historical and operational retail data across online e-commerce channels (website and Shopino marketplace) and physical retail stores (Sari, Gorgan, Capri). 

The system provides:
1. Unified customer identity resolution and Customer 360 profiles.
2. Cross-channel sales reporting (gross orders, returns, cancellations, and tender breakdowns).
3. RFM-based exclusive customer tiering and segmentation.
4. Product catalog and merchandising intelligence (bundle affinities, size/color breakdowns).
5. System sync orchestration and data freshness monitoring.

---

## 2. Technology Stack & Deployment Topology

### 2.1 Core Technologies

| Layer | Component | Version / Library | Source Reference |
|---|---|---|---|
| **Operating Environment** | Docker & Docker Compose | Multi-container Compose specification | `docker-compose.yml` |
| **Reverse Proxy & Web Server** | Nginx | `nginx:1.27-alpine` | `docker-compose.yml`, `docker/nginx.conf`, `docker/nginx-entrypoint.sh` |
| **Backend Framework** | Django / Django REST Framework | Django `5.1.7`, DRF `3.15.2` | `backend/requirements.txt`, `backend/config/settings.py` |
| **WSGI HTTP Server** | Gunicorn | `gunicorn==23.0.0` | `backend/requirements.txt`, `docker/backend-entrypoint.sh` |
| **Relational Database** | PostgreSQL | `postgres:16-alpine` with `psycopg==3.2.6` | `docker-compose.yml`, `backend/requirements.txt` |
| **Calendar / Date Engine** | Jalali / Gregorian conversions | `jdatetime==5.2.0` (backend), `jalaali-js==1.2.8` (frontend) | `backend/requirements.txt`, `frontend/package.json` |
| **Frontend Framework** | React & TypeScript | React `18.3.1`, TypeScript `5.6.3` | `frontend/package.json` |
| **Frontend Build Tool** | Vite | Vite `5.4.11` | `frontend/package.json`, `frontend/vite.config.ts` |
| **Frontend Styling** | Tailwind CSS & PostCSS | Tailwind `3.4.17`, Autoprefixer `10.4.20` | `frontend/package.json`, `frontend/tailwind.config.js` |
| **Client-Side Routing** | React Router DOM | React Router `6.28.0` | `frontend/package.json`, `frontend/src/app/App.tsx` |
| **Automated Testing** | Pytest & Vitest | `pytest==8.3.5`, `pytest-django==4.10.0`, `vitest==2.1.8` | `backend/requirements.txt`, `frontend/package.json` |

### 2.2 Container Responsibilities & Topology

The deployment architecture is fully containerized via `docker-compose.yml` and consists of five cooperative services:

```
                      Internet / Clients
                              │
                    ┌─────────▼─────────┐
                    │       nginx       │ (Ports: 8080/80, 8443/443)
                    │  (Alpine 1.27)    │ Reverse Proxy & SSL Termination
                    └────┬─────────┬────┘
                         │         │
          Static / App   │         │ /api/*, /admin/*
          Assets         │         │
                 ┌───────▼──┐   ┌──▼───────────────┐
                 │ frontend │   │     backend      │
                 │  (Node/  │   │  (Django 5.1 /   │
                 │  Vite)   │   │   Gunicorn)      │
                 └──────────┘   └──┬─────────────┬─┘
                                   │             │
                                   │             │ PostgreSQL TCP 5432
                      ┌────────────▼──┐   ┌──────▼──────┐
                      │   scheduler   │   │  postgres   │
                      │ (Hourly Sync/ │   │ (PostgreSQL │
                      │ Tier Refresh) │   │     16)     │
                      └───────────────┘   └─────────────┘
```

1. **`postgres` (`postgres:16-alpine`)**:
   - Stores all application domain data, synchronized catalogs, customer master records, orders, POS tickets, and system configurations.
   - Uses persistent volume `postgres_data` mapped to `/var/lib/postgresql/data`.
   - Healthcheck: runs `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` every 5 seconds.
2. **`backend` (custom Dockerfile `docker/backend.Dockerfile`)**:
   - Python 3.12 / Django WSGI application executed via Gunicorn.
   - Serves DRF API endpoints under `/api/*` and Django administration under `/admin/*`.
   - Reads environment configuration from `.env`.
   - Healthcheck: queries `http://127.0.0.1:8000/api/health/` every 10 seconds.
3. **`frontend` (custom Dockerfile `docker/frontend.Dockerfile`)**:
   - Development/preview or static build server compiling Vite React SPA.
   - Serves HTML/JS/CSS assets mounted to `/app`. Uses named volume `frontend_node_modules`.
4. **`nginx` (`nginx:1.27-alpine`)**:
   - Front-facing reverse proxy and SSL termination container.
   - Entrypoint script `docker/nginx-entrypoint.sh` dynamically templates `docker/nginx.conf`.
   - In production (`DJANGO_DEBUG=false`), serves static assets directly from `/var/www/frontend` (`frontend/dist`).
   - In development (`DJANGO_DEBUG=true`), proxies web traffic to `frontend:5173`.
   - Proxies `/api/` and `/admin/` requests to `http://backend:8000` with headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
   - Certbot integration (`/var/www/certbot` and `/etc/letsencrypt`) supports automated HTTPS certificates.
5. **`scheduler` (custom Dockerfile `docker/backend.Dockerfile`)**:
   - Background worker executing `docker/scheduler-entrypoint.sh`.
   - Runs migrations on startup (`python manage.py migrate --noinput`).
   - Executes periodic tasks in an infinite loop:
     1. Daily customer tier refresh (`python manage.py refresh_customer_tiers --if-due`).
     2. Hourly incremental Elinor API synchronization (`python manage.py sync_elinor_hourly`).
     3. Sleeps for `${ELINOR_SYNC_INTERVAL_SECONDS:-3600}` seconds before repeating.

---

## 3. Backend / Frontend Boundaries & API Contracts

### 3.1 Communication Boundaries

- **Transport**: JSON over HTTP/1.1 or HTTP/2 via Nginx reverse proxy.
- **Base URL**: `/api/` prefix.
- **Authentication**: Session-based cookie authentication (`rest_framework.authentication.SessionAuthentication`).
- **CSRF Protection**: Standard Django CSRF token (`apps.accounts.views.csrf` sets `csrftoken` cookie; frontend reads cookie via `getCsrfToken()` in `frontend/src/services/api.ts` and passes `X-CSRFToken` header).
- **Session Duration**: 12 hours (`SESSION_COOKIE_AGE = 43200`). Cookie flags: `HttpOnly`, `SameSite=Lax`, and `Secure` when `DJANGO_SECURE_COOKIES=true`.
- **Response Format**: Uniform JSON payloads with explicit HTTP status codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `409 Conflict`). Standard error envelope handled by `apps.core.exceptions.api_exception_handler`.

### 3.2 Primary API Endpoint Routing (`backend/config/urls.py`)

| Route Prefix | Delegated App URLConf | Purpose |
|---|---|---|
| `/api/health/` | `apps.core.health_urls` | Liveness and readiness probes (`/api/health/`). |
| `/api/auth/` | `apps.accounts.urls` | Login, logout, CSRF token generation, current user info (`/me/`). |
| `/api/home/` | `apps.core.urls` | Executive dashboard KPI cards and channel mix trends (`/summary/`). |
| `/api/sales/` | `apps.sales.urls` | Sales KPIs, trend aggregations, order lists, and product sales. |
| `/api/customers/` | `apps.customers.urls` | Customer registry, filtering, export, campaigns, and Customer 360 detail. |
| `/api/products/` | `apps.products.urls` | Product catalog, bundle affinities, size/color cross-tabulations, product 360. |
| `/api/system/` | `apps.system.urls` | Sync engine status, coverage diagnostics, sync triggers, admin user management. |

---

## 4. Data Ingestion Architecture & Upstream Relationships

ELINOR IQ V2 maintains two distinct ingestion pipelines: a high-speed batch historical importer and an incremental live API synchronizer.

```
┌──────────────────────────────────────────────┐
│ Upstream MariaDB Dump (elinor_new)           │
│ source/elinor_new13-septamber-2026.sql (5.4GB)│
└──────────────────────┬───────────────────────┘
                       │ Streaming sed/awk/Python parser (Single pass)
                       ▼
┌──────────────────────────────────────────────┐
│ Temporary CSV files (/tmp/elinor_iq_core_*)  │
└──────────────────────┬───────────────────────┘
                       │ PostgreSQL COPY into UNLOGGED staging tables
                       ▼
┌──────────────────────────────────────────────┐
│ PostgreSQL Staging Schema (_staging_*)       │
└──────────────────────┬───────────────────────┘
                       │ Set-based INSERT ... ON CONFLICT (source_id) DO UPDATE
                       ▼
┌──────────────────────────────────────────────┐
│ Canonical PostgreSQL Models (customers,      │◄────┐
│ orders, pos_sales, products, variants, etc.)  │     │
└──────────────────────────────────────────────┘     │
                                                     │ Resumable REST sync
┌──────────────────────────────────────────────┐     │ (JSON pages / cursors)
│ Upstream Live API (api.elinorboutique.com)   │─────┘
│ Hourly orders, POS sales, customers, payments│
└──────────────────────────────────────────────┘
```

### 4.1 Upstream Database Relationships (MariaDB vs. PostgreSQL)

The upstream source is a monolithic MariaDB 10.6 database named `elinor_new`.
Key structural differences and mappings:
1. **Separation of Sales Tables**:
   - In upstream MariaDB, online e-commerce sales reside in `orders` / `order_items`. Physical store sales reside in `mini_orders` / `mini_order_items`.
   - In ELINOR IQ V2, this architectural separation is deliberately preserved. Online orders map to `Order` (`orders`), while physical store sales map to `PosSale` (`pos_sales`) and `PosSaleItem` (`pos_sale_items`). There is no artificial merge of POS headers into the online `orders` table.
2. **Unified Customer Master**:
   - Both online `orders.customer_id` and POS `mini_orders.customer_id` reference upstream `customers.id`.
   - V2 mirrors this in `apps.customers.models.Customer`, indexing records by `source_id = customers.id`. Both `Order.customer` and `PosSale.customer` point to this shared master entity.
3. **Physical Store Resolution**:
   - Upstream `stores` (id 1, 2, 3, 4) represent physical locations.
   - `stores.id = 1` is the Central Warehouse (انبار مرکزی) — it is a stock location, not a retail sales line.
   - Retail sales lines are derived strictly from `mini_orders.store_id`:
     - `store_id = 2` → `SalesLine.GORGAN` (گرگان)
     - `store_id = 3` → `SalesLine.SARI` (ساری)
     - `store_id = 4` → `SalesLine.CAPRI` (کاپری)
     - Online orders have no `store_id` and are classified as `SalesLine.ONLINE`.

### 4.2 Batch Historical Import Pipeline

- **Source File**: `source/elinor_new13-septamber-2026.sql` (5.4 GB SQL dump).
- **Implementation**: `apps/integrations/elinor/dump_import/runner.py`, `extract.py`, `load.py`.
- **Command**: `python manage.py import_elinor_core [--dump PATH] [--resume] [--only TABLE]`.
- **Methodology**:
  - Does NOT boot a temporary MariaDB container.
  - Streaming parser processes the SQL dump in a single sequential pass, extracting only the 19 required tables into intermediate CSV files under `/tmp/elinor_iq_core_import/`.
  - Uses PostgreSQL `COPY` into `UNLOGGED` staging tables for maximum I/O throughput.
  - Executes SQL set-based `INSERT ... ON CONFLICT (source_id) DO UPDATE`.
  - Full execution completed in **125.97 seconds** for 270,728 customers, 297,095 online orders, 172,680 POS sales, and 76,097 variants.

### 4.3 Incremental Live API Synchronization

- **Implementation**: `apps/integrations/elinor/sync.py`, `client.py`.
- **Endpoints Synced**:
  - Online orders & line items (`/orders`, `/orders/{id}`)
  - POS store sales (`/mini-orders` or equivalent store endpoints)
  - Customer registry updates (`/customers`)
  - Online gateway payments (`/invoices`, `/payments`)
- **Resilience & Rate Limiting**:
  - `ElinorClient` implements token-bucket rate limiting (`ELINOR_RATE_LIMIT_PER_MINUTE = 45`, max requests per sync = 900).
  - Paginated cursor resumption via `apps.integrations.elinor.models.SyncCursor` and `SyncRun`.
  - Stuck run resolution (`clear_stuck_sync_runs(minutes=3)` automatically releases abandoned locks).

---

## 5. Main Services & Module Responsibilities

| Service / App | Location | Primary Responsibility |
|---|---|---|
| **Accounts** | `apps/accounts` | User authentication, session management, role-based access control (`ROLE_SUPER_ADMIN`, `ROLE_ADMIN`, `ROLE_MANAGER`, `ROLE_ANALYST`, `ROLE_STAFF`). |
| **Core** | `apps/core` | Application health checks, system-wide exception handling, data coverage notices (`coverage_payload`), and executive home summary APIs. |
| **Customers** | `apps/customers` | Customer master registry, complex multi-parameter filtering (`list_query.py`), Jalali date calculations, customer detail / Customer 360 payload (`detail.py`), RFM customer tier evaluation (`tiers.py`), scheduled tier refresh (`tier_refresh.py`), marketing campaign audience generation (`campaigns.py`), and streaming CSV export (`export.py`). |
| **Sales** | `apps/sales` | Core sales semantics (`semantics.py`), online order models, POS sale models, online payment records, cross-channel sales KPI calculation (`kpis.py`), sales trend series generation, and operational branch insights. |
| **Products** | `apps/products` | Catalog hierarchies (categories, products, variants, colors, sizes), bundle affinity analysis, and size/color distribution intelligence (`intelligence.py`). |
| **System** | `apps/system` | Administrative monitoring UI backplane: sync execution management (`trigger_sync`, `stop_sync`), POS sync coverage inspection (`sync_coverage`), credentials configuration (`api_config`), and admin provisioning. |
| **Integrations: Elinor** | `apps/integrations/elinor` | Upstream Elinor API client (`client.py`), incremental synchronization orchestrator (`sync.py`), and historical SQL dump ETL engine (`dump_import/`). |

> **Retired:** Smart Direct (`apps/smart_direct`, Instagram messaging) was retired in commit 3bc0a48. Only `models.py` and `migrations/` remain for the existing `smart_direct_*` tables; it is not installed or routed. See [[SMART_DIRECT_INSTAGRAM]] (historical).

---

## 6. Integration Boundaries & External Interfaces

```
┌────────────────────────┐        ┌────────────────────────┐        ┌────────────────────────┐
│  Upstream Elinor API   │◄───────┤    ELINOR IQ V2        ├───────►│  Client Web Browsers   │
│(api.elinorboutique.com)│  HTTPS │  (Reverse Proxy / Nginx)│  HTTPS │  (React 18 Dashboard)  │
└────────────────────────┘        └────────────────────────┘        └────────────────────────┘
```

1. **Elinor Retail Core API**:
   - Protocol: HTTPS REST with Basic / Token authentication.
   - Credentials configured in `.env` or overridden dynamically via `ElinorApiConfig` in the database.
   - Traffic profile: Polled hourly by `scheduler` or triggered on-demand via Settings UI.
2. **End-User Web Browsers**:
   - Accesses dashboard via HTTPS (default port 8080/8443 or domain name).
   - Serves React SPA with responsive Jalali date selectors, RTL layout, and Persian typography.

---

## 7. Critical Dependencies & Potential Failure Points

| Dependency | Impact if Degraded / Failed | Mitigation in Place |
|---|---|---|
| **PostgreSQL 16** | Complete system failure. Both API and background sync crash. | Docker restart policy (`unless-stopped`), healthchecks, persistent Docker volumes, connection pooling (`CONN_MAX_AGE = 60`). |
| **Nginx Reverse Proxy** | System inaccessible from network. | Lightweight Alpine container, entrypoint configuration validation, automatic upstream health tracking. |
| **Upstream Elinor API** | Inability to sync latest orders or POS transactions. | Independent local persistence in PostgreSQL. All dashboard and reporting pages query local DB, remaining 100% operational during upstream outages. Rate limiting and resume cursors prevent API bans. |
| **Scheduler Process** | Incremental syncs and daily tier refreshes pause. | Manual trigger buttons exist in Settings UI (`/settings`); `SyncRun` tracking identifies stalled runs (> 3 min heartbeat lag). |

---

## 8. Architectural Limitations & Known Risks

1. **No Shared Database-Level Revenue Unification**:
   - Online sales (`orders`) and POS sales (`pos_sales`) possess fundamentally different accounting structures. Online orders contain `total_amount`, shipping fees, and discount lines. POS tickets contain tender columns (`cash_amount`, `card_by_card_amount`, `from_wallet_amount`, `digipay_cashier_amount`, `snappay_cashier_amount`) but no single header total column.
   - **Risk**: Blindly summing `Order.total_amount` with POS tender lines introduces double-counting or mismatched return adjustments.
   - **Mitigation**: `apps.sales.semantics` strictly segregates `qualifying_online_orders()` and `qualifying_pos_sales()`.
2. **Historical POS Cutoff**:
   - Upstream POS history begins on **2025-05-31** (when shop warehouses were inaugurated). Online history dates back to **2022-01-12**.
   - **Risk**: Multi-year comparison between online and physical channels prior to mid-2025 is structurally impossible from this dataset.
3. **Synchronous In-Process Ingestion Threads**:
   - On-demand syncs triggered from the UI spawn Python daemon threads (`Thread(target=_run_recent_sync)`) rather than utilizing Celery or Redis.
   - **Risk**: Container restarts during an active on-demand sync terminate the ingestion thread.
   - **Mitigation**: `clear_stuck_sync_runs` releases locked states, and sync operations are fully idempotent using `source_id` uniqueness and day-based tracking (`PosDaySync`).
4. **Retired Smart Direct Tables**:
   - Smart Direct was retired in commit 3bc0a48. The `smart_direct_*` tables remain in PostgreSQL with only `models.py` and `migrations/` in `backend/apps/smart_direct/`; the app is not installed.
   - **Risk**: The tables are no longer maintained by any active code path. Dropping them requires explicit approval (no destructive migrations without sign-off).
5. **No Stock Balances (Inventory Balances Excluded)**:
   - Upstream inventory movement tables (`store_items`, `store_item_transactions`, `store_transfers`) were intentionally excluded during historical ETL. `Variant.quantity` is not populated.
   - **Risk**: ELINOR IQ cannot report current warehouse on-hand stock balances without additional integration passes.
