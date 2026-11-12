# ELINOR IQ V2 — Module Registry

**Document status:** Verified against source code and application architecture.  
**Location:** `docs/modules/MODULE_REGISTRY.md`  
**Last updated:** 2026-10-22  

This registry catalogs the core architectural modules of ELINOR IQ V2. Each entry documents the module's responsibilities, primary source code paths, database models, services, APIs, frontend touchpoints, inter-module dependencies, and traceability status.

---

## Navigation & Cross-References

- [[architecture/SYSTEM_OVERVIEW|System Architecture Overview]]
- [[implementation-status/FEATURE_MATRIX|Feature Verification Matrix]]
- [[CORE_HISTORICAL_IMPORT|Core Historical Import Documentation]]
- [[SOURCE_DATABASE_DISCOVERY|Source Database Discovery Findings]]
- [[SMART_DIRECT_INSTAGRAM|Smart Direct Instagram Integration Guide]] (historical; module retired in commit 3bc0a48)
- [[elinor-pulse-architecture|Elinor Pulse architecture]] (Instagram dashboard, `apps.pulse`)

---

## 1. Accounts & Authentication Module (`apps.accounts`)

- **Responsibility:** Manages user identity, session lifecycle, role-based authorization, and user administration.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/accounts/models.py`
  - `backend/apps/accounts/views.py`
  - `backend/apps/accounts/permissions.py`
  - `backend/apps/accounts/urls.py`
- **Primary Database Models:**
  - `User` (`users` table): Extends `AbstractUser`, defines custom roles: `ROLE_SUPER_ADMIN` (`super_admin`), `ROLE_ADMIN` (`admin`), `ROLE_MANAGER` (`manager`), `ROLE_ANALYST` (`analyst`), `ROLE_STAFF` (`staff`), `ROLE_SALES_AGENT` (`sales_agent`, Call Center only), `ROLE_CONTENT` (`content`, Elinor Pulse only; `accounts.0004`, choices only). `middleware.py` (`SalesAgentScopeMiddleware`) enforces both scopes for every API.
- **Important Services & APIs:**
  - `POST /api/auth/login/` (`login_view`): Authenticates credentials, establishes Django session.
  - `POST /api/auth/logout/` (`logout_view`): Flushes session.
  - `GET /api/auth/me/` (`me`): Returns authenticated user profile, role, and permissions; `features.pulse` is true when `PULSE_ENABLED` and the role is in `apps.pulse.permissions.PULSE_ROLES`.
  - `GET /api/auth/csrf/` (`csrf`): Generates CSRF cookie token for frontend bootstrapping.
  - `IsSuperAdmin`, `is_super_admin`: Permission class restricting privileged administrative endpoints.
  - `/admin/` users (`admin.py`): Django `UserAdmin` forms with role and password (set twice, change link). `manage.py create_user --username NAME [--role ROLE]` (default `content`) asks for the password interactively. Tests: `tests/test_accounts_users.py`.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/LoginPage.tsx`
  - Service: `frontend/src/services/auth.ts` (`authService.login`, `authService.logout`, `authService.me`, `authService.csrf`)
  - Hook / Context: `frontend/src/hooks/useAuth.ts` (`AuthContext`, `useAuth`)
- **Dependencies on Other Modules:** None (foundation module).
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#3-backend--frontend-boundaries--api-contracts]]

---

## 2. Core Infrastructure & Home Page (`apps.core`)

- **Responsibility:** Health checks, JSON error handling, data coverage notices, and the Home page: sales, invoices, basket and
  buyers per period, today so far, branches, trend, sales target progress and «نیاز به توجه». Rules:
  `docs/business-rules/home-and-targets.md`; decision `docs/decisions/0009-home-and-sales-targets.md`.
- **Traceability Status:** **Verified Implementation** on `feature/home-redesign` (not merged).
- **Key Source File Paths:**
  - `backend/apps/core/home.py` (windows, figures, attention), `home_cache.py` (60 s cache), `views.py`, `urls.py`
  - `backend/apps/sales/targets.py` (targets, Jalali periods, progress, copy preview); models `SalesTarget`, `SalesTargetChange`
  - `backend/apps/core/health.py`, `exceptions.py`, `coverage.py`, `metrics.py`, `health_urls.py`
- **Primary Database Models:** `sales_targets`, `sales_target_changes` (`sales.0006`); reads `Order`, `PosSale`, `PosSaleItem`,
  `CustomerMetrics`, `CustomerTierHistory`, `CallTask`, `CallEscalation`, `SyncRun`, `product_status_changes` (`products.0004`).
- **Important Services & APIs:**
  - `GET /api/health/` (`health_check`).
  - `GET /api/home/summary/?period=today|7|30|90|custom&from&to`: figures (cached 60 s) and role-filtered attention items.
  - `GET /api/home/targets/?scope=month|quarter|year`: target progress for the current Jalali period.
  - `GET|PUT /api/sales/targets/?year=`, `GET /api/sales/targets/copy-preview/?year&growth`: Settings grid (super_admin, admin, manager).
  - `coverage_payload()` (`apps.core.coverage`), `api_exception_handler()` (`apps.core.exceptions`).
  - Removed 2026-11-13: `apps/core/home_metrics.py` and the old home payload (`metric_cards`, `recent_orders`, `needs_attention`).
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/HomePage.tsx`; Settings section `features/home/TargetsPanel.tsx`
  - `frontend/src/features/home/` (`TargetsSection.tsx`, `types.ts`); service `frontend/src/services/home.ts`
  - Only `components/dashboard/charts.tsx` `RevenueChart` remains (used by Sales).
- **Dependencies on Other Modules:**
  - `apps.sales` (semantics, targets), `apps.customers` (operators, metrics, tier-change filter), `apps.calls`, `apps.products`,
    `apps.integrations.elinor` (`SyncRun`).
- **Existing Technical Documentation:** [[home-and-targets]], [[architecture/SYSTEM_OVERVIEW#22-container-responsibilities--topology]]

---

## 3. Customer Master, RFM Tiers & 360 Profile (`apps.customers`)

- **Responsibility:** Maintains the canonical customer registry, geographic hierarchy (provinces/cities), address records, RFM-based exclusive customer tier classification, marketing campaign targeting, and Customer 360 detail synthesis.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/customers/models.py`
  - `backend/apps/customers/views.py`
  - `backend/apps/customers/tiers.py`
  - `backend/apps/customers/tier_rules.py`
  - `backend/apps/customers/tier_rule_admin.py`
  - `backend/apps/customers/tier_refresh.py`
  - `backend/apps/customers/list_query.py`
  - `backend/apps/customers/detail.py`
  - `backend/apps/customers/campaigns.py`
  - `backend/apps/customers/export.py`
  - `backend/apps/customers/operators.py`
  - `backend/apps/customers/urls.py`
- **Primary Database Models:**
  - `Customer` (`customers` table): Shared identity master with `source_id`, `mobile` (indexed), `first_name`, `last_name`, `tier_code`, `order_count`, `first_order_at`, `last_order_at`.
  - `CustomerAddress` (`customer_addresses` table): Physical addresses with province and city linkages.
  - `Province` (`provinces`), `City` (`cities`): Geographic administrative hierarchies.
  - `CustomerLevel` (`customer_levels`), `CustomerRole` (`customer_roles`): Legacy club and role lookups.
  - `TierRuleSet` (`customer_tier_rule_sets`): Versioned, ordered tier list `{"tiers": [...]}` (`draft` / `active` / `archived`; at most one active and one draft). Version 1 = the former hard-coded rules (migration `0006_tier_rule_sets`).
  - `CustomerTierHistory` (`customer_tier_history`): One row per actual `tier_code` change, with reason (`baseline`, `daily`, `manual`, `sync`, `activation`), rule version and title snapshots (`previous_tier_title`, `tier_title`).
  - `InternalAccount` (`customer_internal_accounts`): desk/staff accounts excluded from customer reports (kind, note, is_active, created/updated by). Source of truth for `operators.py` (exclusion by customer id); migration `0008_internalaccount` moved the former hard-coded desk mobile, `0009_seed_internal_accounts` adds the 15 owner-confirmed accounts. Rules: `docs/business-rules/internal-accounts.md`.
- **Important Services & APIs:**
  - `GET /api/customers/` (`customer_list`): Paginated customer list with rich multi-parameter filters (city, province, tier, channel, purchase frequency, registered-only, order behavior).
  - `GET /api/customers/list-summary/`, `list-options/`, `GET|POST list-views/`, `DELETE list-views/<id>/`: redesigned list totals, filter choices, saved views. `CustomerMetrics` (`metrics.py`, `refresh_customer_metrics`) backs list sorts and filters. Rules: `docs/business-rules/customer-list.md`.
  - `GET /api/customers/<source_id>/` (`customer_detail`): Complete Customer 360 record combining online orders and POS sales; adds `value` (cards + tier-average comparison + purchase rhythm), `taste`, `calls_header` (`profile360.py`). Sales agents get email, national code and full addresses removed.
  - `GET /api/customers/<source_id>/timeline/?type=all|invoice|call|tier|discount&page=` (`customer_timeline`): one paginated timeline (20). Rules: `docs/business-rules/customer-360.md`.
  - `GET /api/customers/<source_id>/purchases/` (`customer_purchases`): Chronological purchase history across online and physical stores.
  - `GET /api/customers/<source_id>/products/` (`customer_products`): Customer product purchase history with category and variant attribution.
  - `GET /api/customers/campaigns/` (`customer_campaigns`): Audience estimation and segmentation for targeted marketing campaigns.
  - `GET /api/customers/export/` (`customer_export`): Streaming CSV exporter for filtered customer cohorts.
  - `POST /api/customers/refresh-tiers/` (`refresh_tiers`): Triggers full or incremental RFM tier calculation.
  - `tier_code_for()` & `refresh_stored_tiers()` (`apps.customers.tiers`): High-performance Common Table Expression (CTE) scoring customers into exclusive tiers: `VIP`, `DIAMOND`, `GOLD_1`, `GOLD_2`, `SILVER`, `BRONZE_1`, `BRONZE_2`, `BRONZE_3`. Excludes active internal accounts (by customer id). Tiers, order, titles and conditions come from the active `TierRuleSet` (one general list, or one list per channel «اینترنتی»/«حضوری» chosen by the customer's majority channel; `Customer.tier_channel`, migration `0007_tier_channels`) (`tier_rules.tier_case_sql` / `evaluate_tier`); labels via `tiers.tier_title_map()` / `tier_label()`; every write holds a Postgres advisory lock and records `CustomerTierHistory`. `TIER_LABELS` is only the version-1 default.
  - `GET /api/customers/overview/?period=30|month|90|365&compare=prev|yoy` (`overview`, any signed-in user, `overview.py`): Customers page overview, 4 metrics × 8 lenses (all/site/branches/shopino/snappay/digipay), compare deltas, 12-point sparklines, tier counts + net deltas, insights. One SQL pass over `semantics.py` querysets; internal accounts excluded; 15-minute cache. Rules: `docs/business-rules/customer-overview-metrics.md`.
  - `GET /api/customers/tiers/` (`customer_tiers`, any signed-in user): enabled tiers of the active version `[{code, title, priority, summary}]` for filters and badges.
  - Internal accounts API (`IsSuperAdmin`, `internal_accounts.py`): `GET|POST /api/customers/internal-accounts/`, `PATCH /api/customers/internal-accounts/<id>/`; changes start the background tier refresh. Customer 360 adds `internal_account` (super admins only); UI: `features/customers/InternalAccountPanel.tsx` (header menu + confirmed-account banner on `Customer360Page.tsx`).
  - Tier rules API (all `IsSuperAdmin`, `tier_rule_admin.py`): `GET /api/customers/tier-rules/`, `PUT|DELETE /api/customers/tier-rules/draft/`, `POST /api/customers/tier-rules/draft/preview/`, `POST /api/customers/tier-rules/draft/activate/` (202 / 409, background job under the `customer_tiers` lock), `POST /api/customers/tier-rules/<version>/restore/`. Rules: `docs/business-rules/customer-tiers.md`.
- **Frontend Entrypoints & Components:**
  - Pages: `frontend/src/pages/CustomersPage.tsx`, `frontend/src/pages/Customer360Page.tsx` (design `docs/design/customer-360-prototype.html`; call cards in `features/calls/CustomerCalls.tsx`)
  - Overview (list tab, above the filter bar): `frontend/src/features/customers/CustomerOverview.tsx` + `overviewDisplay.ts` (formatting, sparkline, collapsed state in `localStorage` per user); tier legend links open the list with `?tier=CODE`; «ویرایش قوانین» / «به‌روزرسانی سطوح» in its tier panel (super admins only). Design: `docs/design/customers-overview-v3.html`.
  - List filters, sort and page live in the URL: `features/customers/customerListUrl.ts`.
  - Panels: `frontend/src/features/customers/CustomerListPanel.tsx`, `frontend/src/features/customers/CustomerCampaignsPanel.tsx`, `frontend/src/features/customers/CustomerReportsPanel.tsx`
  - Tier rules editor: `frontend/src/features/customers/TierRulesModal.tsx` (+ `tierRules.ts` validation/summary/reorder), opened from `pages/CustomersPage.tsx` («قوانین سطح‌بندی», `?tierRules=1`) for super admins only
  - Dynamic tiers: `frontend/src/hooks/useTiers.ts` (shared fetch of `/api/customers/tiers/`), `features/customers/tierDisplay.tsx` (`TierBadge`, per-code style)
  - Services: `frontend/src/services/customers.ts`, `frontend/src/services/campaigns.ts`
- **Dependencies on Other Modules:**
  - `apps.sales` (queries `Order`, `OrderItem`, `PosSale`, `PosSaleItem` for tiering and purchase histories).
  - `apps.products` (resolves product titles and variant names for 360 view).
- **Existing Technical Documentation:** [[CORE_HISTORICAL_IMPORT#reconciliation-source-tuple-count-vs-v2]], [[SOURCE_DATABASE_DISCOVERY#2-customer-master]]

---

## 4. Sales Semantics, Multi-Channel Transactions & KPI Engine (`apps.sales`)

- **Responsibility:** Enforces the canonical business definitions for sales transactions, isolates online versus physical sales lines, aggregates multi-channel sales KPIs, and manages payment gateway verification.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/sales/models.py`
  - `backend/apps/sales/semantics.py`
  - `backend/apps/sales/services.py`
  - `backend/apps/sales/kpis.py`
  - `backend/apps/sales/analysis.py`
  - `backend/apps/sales/views.py`
  - `backend/apps/sales/urls.py`
- **Primary Database Models:**
  - `Order` (`orders` table): Online checkout transactions (website & Shopino). Fields: `source_id`, `customer`, `status`, `total_amount`, `shipping_amount`, `discount_amount`, `is_shopino`, `created_at`.
  - `OrderItem` (`order_items` table): Online purchase line items.
  - `PosSale` (`pos_sales` table): Physical store tickets. Fields: `source_id`, `customer`, `store_source_id`, `sales_line` (`SARI`, `GORGAN`, `CAPRI`), `type` (`sell`, `refund`, `both`), `cash_amount`, `card_by_card_amount`, `from_wallet_amount`, `digipay_cashier_amount`, `snappay_cashier_amount`, `is_cancelled`, `deleted_at`.
  - `PosSaleItem` (`pos_sale_items` table): Physical store line items with `quantity`, `amount`, `discount_amount`, `real_amount`, `type` (`sell`, `refund`).
  - `Store` (`stores` table): Physical warehouse and shop metadata.
  - `OnlineInvoice` (`online_invoices`), `OnlinePayment` (`online_payments`): Online payment gateway attempts and transaction statuses (DigiPay, SnappPay, Saman, etc.).
- **Important Services & APIs:**
  - `GET /api/sales/kpis/` (`overview_kpis`): Channel-aware sales metrics (gross order count, order value, comparative changes, return counts).
  - `GET /api/sales/trend/` (`overview_trend`): Time-series trend aggregations grouped by day, week, or month.
  - `GET /api/sales/filters/` (`filter_options`): Dynamic filter options (branches, statuses, payment methods).
  - `GET /api/sales/orders/` (`order_list`): Paginated order inspection table.
  - `GET /api/sales/products/` (`product_list`): Product sales performance by channel.
  - `qualifying_online_orders()`, `online_order_value_orders()`, `qualifying_pos_sales()` (`apps.sales.semantics`): Central authority preventing invalid mixing of online revenues with physical store tickets.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/SalesPage.tsx`
  - Components: `frontend/src/features/sales/FilterMultiSelect.tsx`, `frontend/src/components/dashboard/charts.tsx`
  - Service: `frontend/src/services/sales.ts`
- **Dependencies on Other Modules:**
  - `apps.customers` (foreign keys to `Customer`).
  - `apps.products` (foreign keys to `Product` and `Variant`).
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#41-upstream-database-relationships-mariadb-vs-postgresql]], [[SOURCE_DATABASE_DISCOVERY#3-online-sales-schema]], [[SOURCE_DATABASE_DISCOVERY#4-pos-sales-schema]]

---

## 5. Catalog, Categories & Product Intelligence (`apps.products`)

- **Responsibility:** Product catalog (products, variants, attributes), the shared category tree, daily product sales summaries, statuses, central stock, co-purchase pairs, the Products page and Product 360. Rules: `docs/business-rules/products.md`; decision `docs/decisions/0008-products-summary-tables.md`.
- **Traceability Status:** **Verified Implementation** on `feature/products-redesign` (not merged).
- **Key Source File Paths:**
  - `backend/apps/products/models.py`, `categories.py` (tree, descendants, sync from payloads), `daily.py` (set-based rebuilds), `stock.py` (central stock refresh), `report.py` (page queries), `product360.py`, `views.py`, `urls.py`
  - Commands: `sync_categories`, `products_daily [--if-due]`, `refresh_central_stock [--limit N]` (both run in `docker/scheduler-entrypoint.sh` after the tier/metrics pass)
  - Settings: `PRODUCTS_RULES`, `PRODUCTS_EXCLUDE_INTERNAL_SALES`, `PRODUCTS_STOCK_REFRESH_PER_RUN`, `PRODUCTS_LEAD_TIME_DAYS`
- **Primary Database Models:**
  - `Product` (`products`), `Variant` (`variants`), `Category` (`categories`, parent + status), `ProductCategory` (`product_categories`), attribute tables.
  - Summary tables (migration `0003_product_summaries`, rebuilt daily): `ProductDailySales` (`product_daily_sales`: day × product × variant × sales line), `ProductMetrics` (`product_metrics`), `CentralStock` (`product_central_stock`, `main_balance`, central only), `BasketItemDaily` / `BasketPairDaily` (`product_basket_items_daily`, `product_basket_pairs_daily`).
- **Important Services & APIs:**
  - `GET /api/products/categories/`: active category tree with paths and short labels.
  - `GET /api/products/summary/`: range, four cards, branch strip.
  - `GET /api/products/table/`: top 10 or the full sorted, paged list (`export=1` for the CSV).
  - `GET /api/products/pairs/`: co-purchase pairs (`level`, `channel`, `fresh`, `product_id`).
  - `GET /api/products/<id>/`: Product 360.
  - `POST /api/products/<id>/call-list/` (`kind` buyers or prospects; call managers): call list plus a draft program.
  - Removed 2026-11-10: `GET /api/products/`, `/bundles/`, `/size-color/`, `/<id>/360/` and `intelligence.py`.
- **Frontend Entrypoints & Components:**
  - Pages: `frontend/src/pages/ProductsPage.tsx`, `Product360Page.tsx` (`/products/:id`)
  - `frontend/src/features/products/` (`productsUrl.ts` URL state, `display.ts`, `types.ts`), `features/categories/` (`CategoryTreeSelect`, `useCategoryTree`), `components/JalaliDatePicker.tsx` (`JalaliRangePopover`)
  - Service: `frontend/src/services/products.ts`
- **Dependencies on Other Modules:**
  - `apps.sales.semantics` (every sales figure), `apps.customers` (operators, CustomerMetrics, tiers; the customer list's `category_ids` filter), `apps.calls` (lists and programs), `apps.integrations.elinor` (read-only product API for central stock).
- **Existing Technical Documentation:** [[products]], [[SOURCE_DATABASE_DISCOVERY#6-product--variant-relationships]], [[CORE_HISTORICAL_IMPORT#target-models]]

---

## 6. System Administration, Sync Engine & Diagnostics (`apps.system`)

- **Responsibility:** Provides runtime operational monitoring, manual sync triggers, store sync coverage heatmaps, API credentials management, and administrator user provisioning.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/system/views.py`
  - `backend/apps/system/urls.py`
- **Primary Database Models:**
  - Inspects `apps.integrations.elinor.models.SyncRun` and `ElinorApiConfig`.
  - Interacts with `apps.accounts.models.User`.
- **Important Services & APIs:**
  - `GET /api/system/status/` (`status_view`): Operational dashboard returning entity record counts, active sync jobs, last success timestamps, and weekly POS sync status.
  - `GET /api/system/sync/coverage/` (`sync_coverage`): Detailed date-range inspection (up to 60 days) reporting verified vs. missing sync days per physical branch.
  - `POST /api/system/sync/` (`trigger_sync`): Triggers asynchronous background thread for recent incremental sync or targeted POS date-range backfill.
  - `POST /api/system/sync/stop/` (`stop_sync`): Safely aborts running sync operations.
  - `PUT /api/system/api-config/` (`api_config`): Super-admin endpoint updating upstream Elinor API credentials in database.
  - `GET|POST /api/system/admins/` (`admins`): Super-admin endpoint managing administrative system users.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/SettingsPage.tsx`
  - Service: `frontend/src/services/system.ts`
- **Dependencies on Other Modules:**
  - `apps.integrations.elinor` (controls `SyncService`, reads `SyncRun`).
  - `apps.accounts` (enforces `IsSuperAdmin`).
  - `apps.core` (calls `coverage_payload`).
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#22-container-responsibilities--topology]]

---

## 7. Integrations: Elinor Core ETL & Incremental Sync (`apps.integrations.elinor`)

- **Responsibility:** Handles all data interchange with the upstream Elinor systems: both batch ETL parsing from MariaDB SQL dumps and continuous incremental REST synchronization.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/integrations/elinor/client.py`
  - `backend/apps/integrations/elinor/sync.py`
  - `backend/apps/integrations/elinor/models.py`
  - `backend/apps/integrations/elinor/gateway_payments.py`
  - `backend/apps/integrations/elinor/dump_import/runner.py`
  - `backend/apps/integrations/elinor/dump_import/extract.py`
  - `backend/apps/integrations/elinor/dump_import/load.py`
  - `backend/apps/integrations/elinor/management/commands/import_elinor_core.py`
  - `backend/apps/integrations/elinor/management/commands/sync_elinor_hourly.py`
  - `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
  - `backend/apps/integrations/elinor/management/commands/repair_pos_sync.py`
  - `backend/apps/integrations/elinor/management/commands/import_elinor_gateway_payments.py`
- **Primary Database Models:**
  - `SyncRun` (`sync_runs` table): Tracks sync batches, status (`RUNNING`, `SUCCESS`, `FAILED`, `PAUSED`), timestamps, request counters, and JSON execution reports.
  - `SyncCursor` (`sync_cursors` table): Stores resumption tokens and timestamps for incremental endpoints.
  - `PosDaySync` (`pos_day_syncs` table): Audit record tracking confirmed vs. unconfirmed sync status for every store-day combination.
  - `ElinorApiConfig` (`elinor_api_configs` table): Database-stored API endpoint credentials.
- **Important Services & APIs:**
  - `ElinorClient` (`apps.integrations.elinor.client`): Resilient HTTP client with rate-limiting, timeout handling, and pagination unpackers.
  - `SyncService` (`apps.integrations.elinor.sync`): Core orchestrator executing hourly synchronizations, POS backfills, and customer profile updates.
  - `import_elinor_core` command: High-throughput single-pass dump extraction and PostgreSQL `COPY` loader.
- **Frontend Entrypoints & Components:**
  - Managed via `SettingsPage.tsx` through `apps.system` endpoints.
- **Dependencies on Other Modules:**
  - Ingests data into `apps.customers`, `apps.sales`, and `apps.products`.
- **Existing Technical Documentation:** [[CORE_HISTORICAL_IMPORT]], [[SOURCE_DATABASE_DISCOVERY]]

---

## 10. Call Center (`apps.calls`)

- **Models:** `CallSettings`, `CallTag`, `CallList`, `CallListMember`, `CallProgram`, `CallProgramAgent`, `CallFormVersion`, `CallTask`, `CallLog`, `CallAnswerFact`, `CallLogPurchase`, `CustomerCallStatus`, `CustomerCallTag`, `CallEscalation`. Role `sales_agent` in `apps.accounts`; scope in `accounts/middleware.py`.
- **Backend:** `lists.py` (lists, eligibility, Excel), `tasks.py` (background activation), `forms.py` (versions), `logs.py` (save/edit), `agent.py` (work list), `reports.py`, `jobs.py` + `calls_daily` (nightly), `call_center_load` (dev-only load test).
- **APIs (`/api/calls/`):** `tasks/`, `tasks/counts/`, `tasks/bulk/`, `tasks/<id>/`, `tasks/<id>/logs/`, `logs/<id>/`, `customers/<source_id>/`, `customers/<source_id>/clear-dnc/`, `lists/` (+ `<id>/` GET/PATCH/DELETE; POST `create_program`), `lists/excel/`, `programs/` (+ `preview/`, `activate/`, `status/`, `form/`, `form/publish/`), `settings/`, `tags/`, `agents/`, `reports/{sales,escalations,customers,answers,team}/`, `escalations/<id>/close/`.
- **Frontend:** lazy route `/calls` (`pages/CallCenterPage.tsx`), `features/calls/` (`AgentPanel`, `CallFormFields`, `FormBuilder` lazy, `ProgramsPanel`, `ReportsPanel`, `SettingsPanel`, `CreateCallList`, `CustomerCalls`, `callsUrl.ts` for URL state), `services/calls.ts`; `?edit_list=` in `CustomerListPanel`.
- **Tests:** `tests/test_call_center.py`, `features/calls/callForm.test.ts`. **Rules:** `docs/business-rules/call-center.md`.

---

## 11. Elinor Pulse (`apps.pulse`), Instagram — Phases 1–2, behind `PULSE_ENABLED`

- **Status:** branch `feature/elinor-pulse`, not merged. No AI code (`PULSE_AI_ENABLED` reserved). Architecture: `docs/elinor-pulse-architecture.md` (§13 = Phase 2).
- **Models (all `ig_`):** `IgAccount`, `IgPost` (unique `shortcode`; latest metrics), `IgPostSnapshot` (post × Tehran day, first 30 days), `IgAccountDaily`, `IgProductCode` (code → `products.id`, no DB constraint), `IgPostProduct` (caption codes by `position`), `IgMediaAsset`, `IgSyncRun`.
- **Backend:** `captions.py` (caption codes), `codes.py` (title code `(?<![0-9])([0-9]{4})\s*(?:\||$)`, rebuild), `shares.py` (2:1 weights, computed on read), `zernio.py` (read-only Zernio REST client), `media.py` (covers through the Cloudflare relay `PULSE_COVER_RELAY_URL`, Meta CDN URLs only; product thumbnails direct), `covers.py` (export / import by shortcode, small-copy backfill); covers get a 600 px list copy (`small_path`, Pillow, `pulse.0004`); `pulse_media` is mounted read-only on `backend`, `sync.py` (jobs, `--if-due`, advisory lock, `ig_sync_runs`).
- **Commands:** `pulse_import_csv <path>`, `pulse_sync --if-due` (3 h), `pulse_match_products --if-due` (after each sync), `pulse_snapshot --if-due` (daily after 00:30 Tehran), `pulse_backfill_snapshots --if-due` (daily, Zernio post-timeline, never replaces our rows), `pulse_daily_brief --if-due` (after 08:00 Tehran). One-off: `pulse_sync --full` (90 days), `pulse_fetch_covers`, `pulse_export_covers <folder|.tar.gz>`, `pulse_import_covers <folder|.tar.gz>`, `pulse_make_small_covers`. New dependency: `Pillow==11.0.0` (Phase 2.2). Run by the `pulse-scheduler` service (`docker/pulse-scheduler-entrypoint.sh`), never by the main scheduler.
- **Phase 2 backend:** `rules.py` (all thresholds), `analytics.py` (groups, medians, scores, KPIs, golden hours, products, autopsy), `texts.py` (all Persian sentences), `brief.py` (6 task rules, brief), `backfill.py`, `permissions.py` (`PULSE_ROLES`, `PulseAccess`), `views.py` + `urls.py` (`/api/pulse/`: status, home, tasks toggle, posts, posts/<id>, products, products/<code>, hours, media/<id>). Models `IgDailyBrief`, `IgDailyTask` (`pulse.0002`; `IgDailyTask.post` and `IgMediaAsset.url_checked_at` in `pulse.0003`).
- **Frontend:** lazy route `/pulse` (`pages/PulsePage.tsx`), `features/pulse/` (`HomeTab`, `PostsTab`, `ProductsTab`, `HoursTab`, `Sheets`, `ui`, `format`, `types`), `services/pulse.ts`; Pulse tokens `--pulse*`, `--s-*` in `styles/index.css`; nav item «پالس» via `lib/nav.ts` (`features.pulse`).
- **Isolation:** reads `products` / `variants` only; never calls the Elinor API; never writes core tables (tested).
- **Tests:** `tests/test_pulse.py` (fixture `tests/fixtures/pulse/posts_100.csv`), `tests/test_pulse_phase2.py`; frontend `features/pulse/format.test.ts`, `lib/nav.test.ts`.

---

## 8. Smart Direct (`apps.smart_direct`) — RETIRED

- **Status:** Retired in commit 3bc0a48. Not in `INSTALLED_APPS`, not routed, no frontend page.
- **What remains:** `backend/apps/smart_direct/models.py` and `migrations/`, kept only so the existing `smart_direct_*` tables
  (`smart_direct_sessions`, `smart_direct_events`, `smart_direct_temporary_contexts`, `smart_direct_processed_events`,
  `smart_direct_runtime_state`) stay described. Do not re-add or build on this module.
- **Historical documentation:** [[SMART_DIRECT_INSTAGRAM]] describes the former webhook, session and reply design.

---

## 9. Frontend Web Application (`frontend/src`)

- **Responsibility:** Responsive, right-to-left (RTL) Persian single-page application delivering executive dashboards, operational reports, interactive filters, and data visualizations.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `frontend/src/app/App.tsx`
  - `frontend/src/layouts/AppShell.tsx`
  - `frontend/src/layouts/Sidebar.tsx`
  - `frontend/src/components/JalaliDatePicker.tsx`
  - `frontend/src/components/TrendChart.tsx`
  - `frontend/src/components/dashboard/`
  - `frontend/src/types/index.ts`
  - `frontend/src/lib/dates.ts`
  - `frontend/src/lib/format.ts`
- **Key Modules & Feature Structure:**
  - `layouts/AppShell.tsx`: Collapsible RTL sidebar navigation, active user status, and theme switching.
  - `components/JalaliDatePicker.tsx`: Solar Hijri (Jalali) single date and date range picker using `jalaali-js`.
  - `components/dashboard/`: Reusable metric cards, comparison gauges, revenue breakdown charts, and progress bars.
  - `types/index.ts`: Strict TypeScript type definitions for API contracts, customer profiles, sales filters, and dashboard payloads.
- **Frontend-Backend Contract Verification:**
  - All frontend API clients in `frontend/src/services/` map directly to verified Django REST framework view endpoints.
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#21-core-technologies]]
