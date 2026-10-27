# ELINOR IQ V2 — Feature Verification Matrix

**Document status:** Verified against source code, test definitions, and architectural documentation.  
**Location:** `docs/implementation-status/FEATURE_MATRIX.md`  
**Last updated:** 2026-10-24 (Customer Master test evidence re-run in Docker on 2026-10-24)  

---

## 1. Methodology & Evaluation Dimensions

In accordance with ELINOR IQ verification principles, no feature is classified as "Complete" merely because a file or class exists. Every capability is independently evaluated across three separate dimensions:

1. **Code Implementation:**
   - `IMPLEMENTED`: Full end-to-end backend logic, database persistence, and corresponding frontend interfaces exist in the codebase.
   - `PARTIAL`: Core algorithms or APIs exist, but edge-case handlers, UI connections, or complete sub-workflows remain incomplete or degraded.
   - `NOT_IMPLEMENTED`: Architectural concept or business requirement identified in design documents, but absent from executable code.
   - `UNKNOWN`: Implementation status cannot be verified from available code assets alone.
   - `RETIRED`: Feature was removed from the active app; only historical schema or docs remain.
2. **Test Evidence:**
   - `PASSING`: Tests exist and were executed with verified zero-failure output in the current environment.
   - `FAILING`: Tests exist and failed during execution.
   - `NOT_RUN`: Automated test suites exist in the repository (e.g., Pytest in `backend/tests/` or Vitest in `frontend/src/`), but were not executed in the current documentation session.
   - `NO_TESTS_FOUND`: No automated test file or case was discovered targeting this specific feature.
3. **Deployment Verification:**
   - `VERIFIED`: Confirmed operational against live production endpoints or staging environments.
   - `UNVERIFIED`: Production runtime behavior has not been actively verified in the current evaluation session.
   - `UNKNOWN`: Deployment status cannot be determined.

### Traceability Categories
Every feature entry explicitly identifies its status:
- `[Verified Implementation]`: Grounded in source code with verified classes, models, and endpoints.
- `[Documented Historical Behavior]`: Documented behavior from prior imports or historical system states.
- `[Business Requirement]`: Defined business rule or operational constraint governing system logic.
- `[Planned Feature]`: Backlogged or anticipated capability not yet active in V2.
- `[Unknown / Disputed Behavior]`: Conflicting semantics or unresolved system questions.

---

## 2. Feature Verification Matrix

| Feature Area | Specific Capability | Code Implementation | Test Evidence | Deployment Verification | Key Source Files & Traceability | Category & Notes |
|---|---|---|---|---|---|---|
| **Auth & Security** | Session Login / Logout | `IMPLEMENTED` | `NOT_RUN` (`test_auth.py`) | `UNVERIFIED` | `backend/apps/accounts/views.py` (`login_view`, `logout_view`), `frontend/src/services/auth.ts` | `[Verified Implementation]` High confidence. Standard Django session auth. |
| **Auth & Security** | CSRF Bootstrapping | `IMPLEMENTED` | `NOT_RUN` (`test_auth.py`) | `UNVERIFIED` | `backend/apps/accounts/views.py` (`csrf`), `frontend/src/services/api.ts` (`getCsrfToken`) | `[Verified Implementation]` Sets `csrftoken` cookie and validates header. |
| **Auth & Security** | Role-Based Access Control | `IMPLEMENTED` | `NOT_RUN` (`test_platform_access.py`) | `UNVERIFIED` | `backend/apps/accounts/permissions.py` (`IsSuperAdmin`), `models.py` (`User.role`) | `[Verified Implementation]` Roles: Super Admin, Admin, Manager, Analyst, Staff. |
| **Auth & Security** | Super Admin Management | `IMPLEMENTED` | `NOT_RUN` (`test_platform_access.py`) | `UNVERIFIED` | `backend/apps/system/views.py` (`admins`), `create-superadmin.sh` | `[Verified Implementation]` Restricted to Super Admin users. |
| **Core & Overview** | Service Health Probes | `IMPLEMENTED` | `NOT_RUN` (`test_health.py`) | `UNVERIFIED` | `backend/apps/core/health.py` (`health_check`), `docker/backend.Dockerfile` | `[Verified Implementation]` Healthcheck queries `/api/health/`. |
| **Core & Overview** | Executive Home Metrics | `IMPLEMENTED` | `NOT_RUN` (`test_sales_overview.py`) | `UNVERIFIED` | `backend/apps/core/views.py` (`home_summary`), `frontend/src/pages/HomePage.tsx` | `[Verified Implementation]` Aggregates order count, gross value, and channel splits. |
| **Core & Overview** | POS Data Freshness Notice | `IMPLEMENTED` | `NOT_RUN` (`test_pos_sync_coverage.py`) | `UNVERIFIED` | `backend/apps/core/coverage.py` (`coverage_payload`), `HomePage.tsx` | `[Verified Implementation]` Flags store lag > 1 day compared to today's date. |
| **Sales Analytics** | Channel-Specific KPI Cards | `IMPLEMENTED` | `NOT_RUN` (`test_sales_kpis.py`) | `UNVERIFIED` | `backend/apps/sales/kpis.py` (`overview_kpis_payload`), `frontend/src/pages/SalesPage.tsx` | `[Verified Implementation]` High confidence. Separate online and POS calculations. |
| **Sales Analytics** | Time-Series Sales Trends | `IMPLEMENTED` | `NOT_RUN` (`test_sales_overview.py`) | `UNVERIFIED` | `backend/apps/sales/views.py` (`overview_trend`), `frontend/src/components/TrendChart.tsx` | `[Verified Implementation]` Grouped by day, week, or month in Jalali calendar. |
| **Sales Analytics** | Sales Semantics Isolation | `IMPLEMENTED` | `NOT_RUN` (`test_sales_analysis.py`) | `UNVERIFIED` | `backend/apps/sales/semantics.py` (`qualifying_online_orders`, `qualifying_pos_sales`) | `[Business Requirement]` Online order value strictly segregated from POS tickets. |
| **Sales Analytics** | Multi-Branch Physical Sales | `IMPLEMENTED` | `NOT_RUN` (`test_sales_overview.py`) | `UNVERIFIED` | `backend/apps/sales/models.py` (`PosSale`), `semantics.py` (`STORE_SALES_LINE`) | `[Verified Implementation]` Sari (store 3), Gorgan (store 2), Capri (store 4). |
| **Sales Analytics** | Payment Gateway Tracking | `IMPLEMENTED` | `NOT_RUN` (`test_gateway_payments.py`) | `UNVERIFIED` | `backend/apps/sales/models.py` (`OnlinePayment`), `gateway_payments.py` | `[Verified Implementation]` Tracks online gateway attempts (DigiPay, SnappPay, etc.). |
| **Sales Analytics** | Shopino Marketplace Tracking | `IMPLEMENTED` | `NOT_RUN` (`test_sales_overview.py`) | `UNVERIFIED` | `backend/apps/sales/models.py` (`Order.is_shopino`), `semantics.py` | `[Verified Implementation]` Online subchannel flag (28,649 historical orders). |
| **Customer Master** | Unified Customer Registry | `IMPLEMENTED` | `PASSING` (`test_customers.py`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/models.py` (`Customer`), `list_query.py` | `[Verified Implementation]` Unique mobile constraint. 270,728 customer master rows. |
| **Customer Master** | Rich Multi-Filter Querying | `IMPLEMENTED` | `PASSING` (`test_customer_list.py`, `customerListFilters.test.ts`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/list_query.py`, `frontend/src/features/customers/CustomerListPanel.tsx` | `[Verified Implementation]` Filters by city, province, tier, channel, dates, and order count. |
| **Customer Master** | Customer 360 View | `IMPLEMENTED` | `PASSING` (`test_customer_360.py`, `customer360Display.test.ts`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/detail.py` (`customer_360_payload`), `Customer360Page.tsx` | `[Verified Implementation]` Aggregates online orders and POS sales per customer. |
| **Customer Master** | Operator Account Exclusion | `IMPLEMENTED` | `PASSING` (`test_operator_accounts.py`, 2026-10-25) | `UNVERIFIED` | `backend/apps/customers/operators.py` (`exclude_operator_accounts`), `InternalAccount` | `[Business Requirement]` Strips staff/desk accounts from purchasing counts, tiers and RFM; source is `InternalAccount` since migration 0008. |
| **Customer Master** | Streaming Customer CSV Export | `IMPLEMENTED` | `FAILING` (`test_customer_export.py`, 2026-10-24: 3 tests read `.content` on a `StreamingHttpResponse`; 1 uses missing fixture `api_client`) | `UNVERIFIED` | `backend/apps/customers/export.py` (`iter_customer_export_csv`) | `[Verified Implementation]` Chunked CSV export without buffering in RAM. |
| **Customer Master** | Exclusive RFM Tier Engine | `IMPLEMENTED` | `PASSING` (`test_customer_tiers.py`, `test_customer_tier_rules.py`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/tiers.py` (`tier_code_for`, `write_all_tiers`, `refresh_stored_tiers`), `tier_rules.py` (`tier_case_sql`, `evaluate_tier`) | `[Business Requirement]` Tiers: VIP, DIAMOND, GOLD 1/2, SILVER, BRONZE 1/2/3. Tiers and conditions come from the active `TierRuleSet`; see `docs/business-rules/customer-tiers.md`. |
| **Customer Master** | Dynamic Tier Rules (versions, ordered/custom tiers, preview, activation, tier history) | `IMPLEMENTED` | `PASSING` (`test_customer_tier_rules.py`, `tierRules.test.ts`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/tier_rule_admin.py`, `tier_rules.py`, `models.py` (`TierRuleSet`, `CustomerTierHistory`), migration `0006_tier_rule_sets`, `frontend/src/features/customers/TierRulesModal.tsx`, `hooks/useTiers.ts` | `[Verified Implementation]` Super admin only, modal on the Customers page. Phase 1 + Amendment A. Checked locally by the owner. |
| **Customer Master** | RFM Report (Stage 1) and «باشگاه مشتریان» menu | `IMPLEMENTED` | `PASSING` (`test_customer_rfm.py`, `rfmDisplay.test.ts`, 2026-10-25) | `UNVERIFIED` | `backend/apps/customers/rfm.py`, `models.py` (`CustomerRfm`, `CustomerRfmSnapshot`), migration `0007_customer_rfm`, `frontend/src/features/customers/RfmReportPanel.tsx`, `pages/ClubPage.tsx` | `[Verified Implementation]` Independent of tiers; thresholds provisional; uncommitted. |
| **Customer Master** | Internal (staff/desk) accounts: detection signals, confirm/restore, exclusion | `IMPLEMENTED` | `PASSING` (`test_internal_accounts.py`, `test_operator_accounts.py`, 2026-10-25) | `UNVERIFIED` | `backend/apps/customers/operators.py`, `internal_accounts.py`, `rfm.py` (signals), migration `0008_internal_accounts`, `frontend/src/features/customers/InternalAccountPanel.tsx` | `[Verified Implementation]` Human confirmation only; sales totals unchanged; uncommitted. |
| **Customer Master** | Channel-based tiers («اینترنتی» / «حضوری») | `IMPLEMENTED` | `PASSING` (`test_tier_channels.py`, `tierDisplay.test.ts`, 2026-10-26) | `UNVERIFIED` | `backend/apps/customers/tier_rules.py`, `tiers.py`, `tier_rule_admin.py`, migration `0007_tier_channels`, `frontend/src/features/customers/TierRulesModal.tsx` | `[Verified Implementation]` Released on `production` (`1400d6b`), merged into `main`; draft created by the migration, activation by the owner. |
| **Customer Master** | Scheduled Daily Tier Refresh | `IMPLEMENTED` | `PASSING` (`test_customer_tiers.py`, 2026-10-24) | `UNVERIFIED` | `backend/apps/customers/tier_refresh.py`, `docker/scheduler-entrypoint.sh` | `[Verified Implementation]` Runs daily via scheduler; idempotent CTE update. |
| **Customer Master** | Marketing Campaign Audience | `IMPLEMENTED` | `FAILING` (`test_customer_campaigns.py`, 2026-10-24: `test_customer_campaigns_api_and_redemptions` asserts `0 >= 600000`) | `UNVERIFIED` | `backend/apps/customers/campaigns.py`, `CustomerCampaignsPanel.tsx` | `[Verified Implementation]` Segment targeting by tier, channel, and inactivity window. |
| **Merchandising** | Product Catalog & Hierarchy | `IMPLEMENTED` | `NOT_RUN` (`test_products_and_coverage.py`) | `UNVERIFIED` | `backend/apps/products/models.py` (`Product`, `Variant`, `Category`), `ProductsPage.tsx` | `[Verified Implementation]` 7,369 products and 76,097 variants in catalog. |
| **Merchandising** | Bundle Affinity Mining | `IMPLEMENTED` | `NOT_RUN` (`test_product_intelligence.py`) | `UNVERIFIED` | `backend/apps/products/intelligence.py` (`product_bundles_report`) | `[Verified Implementation]` Co-occurrence basket analysis for cross-sell bundles. |
| **Merchandising** | Size/Color Distribution | `IMPLEMENTED` | `NOT_RUN` (`test_product_intelligence.py`) | `UNVERIFIED` | `backend/apps/products/intelligence.py` (`product_size_color_intelligence`) | `[Verified Implementation]` Cross-tabulated sales volume by color and size attribute. |
| **Merchandising** | Product 360 Velocity Report | `IMPLEMENTED` | `NOT_RUN` (`test_product_intelligence.py`) | `UNVERIFIED` | `backend/apps/products/intelligence.py` (`product_360_report`) | `[Verified Implementation]` Multi-channel sales velocity and buyer demographic breakdown. |
| **Merchandising** | Stock / Inventory Balances | `NOT_IMPLEMENTED` | `NO_TESTS_FOUND` | `UNVERIFIED` | `docs/CORE_HISTORICAL_IMPORT.md`, `SOURCE_DATABASE_DISCOVERY.md` | `[Planned Feature]` Inventory balances excluded during initial ETL; `Variant.quantity` unpopulated. |
| **Data Ingestion** | Batch Historical SQL ETL | `IMPLEMENTED` | `NOT_RUN` (`test_import_core.py`) | `UNVERIFIED` | `backend/apps/integrations/elinor/dump_import/runner.py`, `import_elinor_core.py` | `[Verified Implementation]` Single-pass streaming parser + UNLOGGED COPY (125.97s runtime). |
| **Data Ingestion** | Incremental Hourly Online Sync | `IMPLEMENTED` | `NOT_RUN` (`test_sync.py`, `test_details_sync.py`) | `UNVERIFIED` | `backend/apps/integrations/elinor/sync.py` (`execute_hourly`), `client.py` | `[Verified Implementation]` Token-bucket rate limited; cursor-based resumption. |
| **Data Ingestion** | Multi-Day POS Store Sync | `IMPLEMENTED` | `NOT_RUN` (`test_pos_sync.py`) | `UNVERIFIED` | `backend/apps/integrations/elinor/sync.py` (`execute_pos`), `repair_pos_sync.py` | `[Verified Implementation]` Fetches daily store transactions; tracks audit in `PosDaySync`. |
| **Data Ingestion** | API Rate Limiting & Safety | `IMPLEMENTED` | `NOT_RUN` (`test_elinor_client.py`) | `UNVERIFIED` | `backend/apps/integrations/elinor/client.py` (`ElinorClient`) | `[Verified Implementation]` Max 45 req/min, max 900 req/run; handles HTTP 429 backoff. |
| **System Operations** | Settings Management UI | `IMPLEMENTED` | `NO_TESTS_FOUND` | `UNVERIFIED` | `backend/apps/system/views.py`, `frontend/src/pages/SettingsPage.tsx` | `[Verified Implementation]` Sync triggers, store sync coverage heatmap, credentials config. |
| **System Operations** | Automated Database Backup | `PARTIAL` | `NO_TESTS_FOUND` | `UNVERIFIED` | `backend/apps/system/views.py` (`status_view`), `restore-database.sh` | `[Planned Feature]` Status view reports: backup infrastructure prepared, not automated in UI. |
| **Smart Direct** | Instagram messaging (webhook, dedup, 72h context, replies) | `RETIRED` | `N/A` | `N/A` | `backend/apps/smart_direct/models.py`, `migrations/` only | Removed from the active app in commit 3bc0a48; not installed or routed. Historical design: [[SMART_DIRECT_INSTAGRAM]]. |
| **UI & UX** | Persian RTL Layout | `IMPLEMENTED` | `NOT_RUN` (`src/lib/theme.test.ts`) | `UNVERIFIED` | `frontend/src/styles/index.css`, `frontend/src/layouts/AppShell.tsx` | `[Verified Implementation]` Native RTL direction with Vazirmatn Persian typography. |
| **UI & UX** | Jalali Date Range Picker | `IMPLEMENTED` | `NOT_RUN` (`src/lib/dates.test.ts`, `src/lib/format.test.ts`) | `UNVERIFIED` | `frontend/src/components/JalaliDatePicker.tsx`, `frontend/src/lib/dates.ts` | `[Verified Implementation]` Solar Hijri date selection, presets, and conversion to ISO UTC. |

---

## 3. Discrepancies & Historical Differences from Onboarding Report

During the detailed source verification phase, several nuances and concrete implementations were reconciled against initial onboarding assumptions:

1. **POS Revenue vs. Tender Columns:**
   - *Initial Assumption:* POS sales records were assumed to have a single header-level `total_amount` comparable to online orders.
   - *Verified Implementation:* `PosSale` (`mini_orders`) possesses **no total amount column**. Instead, revenue exists only as tender breakdown fields (`cash_amount`, `card_by_card_amount`, `from_wallet_amount`, `digipay_cashier_amount`, `snappay_cashier_amount`) or as item-level products (`amount * quantity`). Semantics enforce strict separation between online order value and store transactions.
2. **Shopino Marketplace Classification:**
   - *Initial Assumption:* Shopino might represent a separate physical branch or fifth sales line.
   - *Verified Implementation:* Shopino is an online subchannel (`Order.is_shopino = True`), representing marketplace orders sharing the central catalog and online fulfillment pipeline.
3. **Customer Identity Uniqueness:**
   - *Initial Assumption:* Mobile number cleanup might require fuzzy matching or deduplication heuristics.
   - *Verified Implementation:* The upstream MariaDB source schema enforced a `UNIQUE` index on `mobile`. All 270,728 customer rows are uniquely identified by mobile; deduplication was unnecessary.
4. **Inventory Balances Exclusion:**
   - *Initial Assumption:* Stock on hand might be reportable alongside catalog items.
   - *Verified Implementation:* The historical ETL pipeline (`import_elinor_core`) intentionally omitted `store_items` and `store_item_transactions` to maximize import speed (125.97s). Consequently, `Variant.quantity` remains unpopulated in the current database.
5. **Smart Direct Storage Scope (historical; module retired in commit 3bc0a48):**
   - *Initial Assumption:* Instagram direct message histories might be permanently archived.
   - *Verified Implementation:* ELINOR IQ explicitly avoids permanent transcript storage for privacy and database sizing. It retains only structured session outcomes (`SmartDirectSession`, `SmartDirectEvent`) and an ephemeral 72-hour context buffer (`TemporaryConversationContext`).
