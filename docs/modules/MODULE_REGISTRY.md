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
  - `User` (`users` table): Extends `AbstractUser`, defines custom roles: `ROLE_SUPER_ADMIN` (`super_admin`), `ROLE_ADMIN` (`admin`), `ROLE_MANAGER` (`manager`), `ROLE_ANALYST` (`analyst`), `ROLE_STAFF` (`staff`).
- **Important Services & APIs:**
  - `POST /api/auth/login/` (`login_view`): Authenticates credentials, establishes Django session.
  - `POST /api/auth/logout/` (`logout_view`): Flushes session.
  - `GET /api/auth/me/` (`me`): Returns authenticated user profile, role, and permissions.
  - `GET /api/auth/csrf/` (`csrf`): Generates CSRF cookie token for frontend bootstrapping.
  - `IsSuperAdmin`, `is_super_admin`: Permission class restricting privileged administrative endpoints.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/LoginPage.tsx`
  - Service: `frontend/src/services/auth.ts` (`authService.login`, `authService.logout`, `authService.me`, `authService.csrf`)
  - Hook / Context: `frontend/src/hooks/useAuth.ts` (`AuthContext`, `useAuth`)
- **Dependencies on Other Modules:** None (foundation module).
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#3-backend--frontend-boundaries--api-contracts]]

---

## 2. Core Infrastructure & Dashboard Summary (`apps.core`)

- **Responsibility:** Provides platform-wide health monitoring, centralized REST exception handling, data coverage notices, and executive overview metrics.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/core/health.py`
  - `backend/apps/core/exceptions.py`
  - `backend/apps/core/coverage.py`
  - `backend/apps/core/views.py`
  - `backend/apps/core/home_metrics.py`
  - `backend/apps/core/metrics.py`
  - `backend/apps/core/urls.py`
  - `backend/apps/core/health_urls.py`
- **Primary Database Models:**
  - No dedicated tables; operates across `Order`, `PosSale`, and `Customer` models.
- **Important Services & APIs:**
  - `GET /api/health/` (`health_check`): Evaluates database connectivity and service readiness.
  - `GET /api/home/summary/` (`home_summary`): Aggregates cross-channel executive metrics (order volume, gross merchandise value, store vs. online breakdown, recent trends).
  - `coverage_payload()` (`apps.core.coverage`): Computes data freshness and lag across POS sales lines (`SARI`, `GORGAN`, `CAPRI`) against system date.
  - `api_exception_handler()` (`apps.core.exceptions`): Enforces consistent JSON error schemas.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/HomePage.tsx`
  - Service: `frontend/src/services/home.ts`
  - Components: `frontend/src/components/dashboard/metricCards.tsx`, `frontend/src/components/dashboard/charts.tsx`
- **Dependencies on Other Modules:**
  - `apps.sales` (queries `Order`, `PosSale`, and sales semantics).
  - `apps.customers` (queries `Customer`).
  - `apps.integrations.elinor` (inspects `SyncCursor`).
- **Existing Technical Documentation:** [[architecture/SYSTEM_OVERVIEW#22-container-responsibilities--topology]], [[CORE_HISTORICAL_IMPORT#compatibility-notes]]

---

## 3. Customer Master, RFM Tiers & 360 Profile (`apps.customers`)

- **Responsibility:** Maintains the canonical customer registry, geographic hierarchy (provinces/cities), address records, RFM-based exclusive customer tier classification, marketing campaign targeting, and Customer 360 detail synthesis.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/customers/models.py`
  - `backend/apps/customers/views.py`
  - `backend/apps/customers/tiers.py`
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
- **Important Services & APIs:**
  - `GET /api/customers/` (`customer_list`): Paginated customer list with rich multi-parameter filters (city, province, tier, channel, purchase frequency, registered-only, order behavior).
  - `GET /api/customers/<source_id>/` (`customer_detail`): Complete Customer 360 record combining online orders and POS sales.
  - `GET /api/customers/<source_id>/purchases/` (`customer_purchases`): Chronological purchase history across online and physical stores.
  - `GET /api/customers/<source_id>/products/` (`customer_products`): Customer product purchase history with category and variant attribution.
  - `GET /api/customers/campaigns/` (`customer_campaigns`): Audience estimation and segmentation for targeted marketing campaigns.
  - `GET /api/customers/export/` (`customer_export`): Streaming CSV exporter for filtered customer cohorts.
  - `POST /api/customers/refresh-tiers/` (`refresh_tiers`): Triggers full or incremental RFM tier calculation.
  - `tier_code_for()` & `refresh_stored_tiers()` (`apps.customers.tiers`): High-performance Common Table Expression (CTE) scoring customers into exclusive tiers: `VIP`, `DIAMOND`, `GOLD_1`, `GOLD_2`, `SILVER`, `BRONZE_1`, `BRONZE_2`, `BRONZE_3`. Excludes operator desk accounts.
- **Frontend Entrypoints & Components:**
  - Pages: `frontend/src/pages/CustomersPage.tsx`, `frontend/src/pages/Customer360Page.tsx`
  - Panels: `frontend/src/features/customers/CustomerListPanel.tsx`, `frontend/src/features/customers/CustomerCampaignsPanel.tsx`, `frontend/src/features/customers/CustomerReportsPanel.tsx`
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

## 5. Catalog, Attributes & Merchandising Intelligence (`apps.products`)

- **Responsibility:** Manages product catalog entities, hierarchical categories, variants, color/size attributes, bundle affinity mining, and cross-tabulated merchandising intelligence.
- **Traceability Status:** **Verified Implementation** (Confidence: HIGH).
- **Key Source File Paths:**
  - `backend/apps/products/models.py`
  - `backend/apps/products/intelligence.py`
  - `backend/apps/products/views.py`
  - `backend/apps/products/urls.py`
- **Primary Database Models:**
  - `Product` (`products` table): Master catalog items with `source_id`, `title`, `sku`, `barcode`, `status`.
  - `Category` (`categories`), `ProductCategory` (`product_categories`): Hierarchical category taxonomy.
  - `Variant` (`variants` table): Specific product varieties with `price`, `color_name`, `size`, `sku`, `barcode`.
  - `Color` (`colors`), `ProductAttribute` (`product_attributes`), `ProductAttributeValue` (`product_attribute_values`), `VariantAttribute` (`variant_attributes`): EAV and color/size attribute relations.
- **Important Services & APIs:**
  - `GET /api/products/` (`product_list`): Paginated product list with search and category filtering.
  - `GET /api/products/bundles/` (`product_bundles`): Market basket co-occurrence analysis calculating product bundle affinities from historical order baskets.
  - `GET /api/products/size-color/` (`product_size_color`): Merchandising intelligence breaking down sales volumes across size and color combinations.
  - `GET /api/products/<product_id>/360/` (`product_360`): Comprehensive product report showing sales velocity, channel distribution, and customer demographics.
- **Frontend Entrypoints & Components:**
  - Page: `frontend/src/pages/ProductsPage.tsx`
  - Service: `frontend/src/services/products.ts`
- **Dependencies on Other Modules:**
  - `apps.sales` (queries `OrderItem` and `PosSaleItem` for sales analysis).
- **Existing Technical Documentation:** [[SOURCE_DATABASE_DISCOVERY#6-product--variant-relationships]], [[CORE_HISTORICAL_IMPORT#target-models]]

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
