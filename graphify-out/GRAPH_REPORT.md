# Graph Report - elinor-iq-v2  (2026-10-25)

## Corpus Check
- 281 files · ~128,444 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 3, .woff2 3, .Dockerfile 2)

## Summary
- 2176 nodes · 6566 edges · 125 communities (84 shown, 41 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 790 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `accb9d81`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- runner.py
- types/index.ts
- test_pos_sync.py
- CustomerListPanel.tsx
- django_db
- SyncService
- SalesPage.tsx
- SettingsPage.tsx
- AppShell.tsx
- tier_rule_admin.py
- package.json
- kpis.py
- sales/views.py
- analysis.py
- Product
- ElinorClient
- sync.py
- list_query.py
- Customer
- SalesLine
- JalaliDatePicker.tsx
- Customer360Page.tsx
- home_metrics.py
- PosSale
- django_apps
- ingest.py
- smart_direct/models.py
- OnlinePayment
- dashboard/index.ts
- test_customer_tier_rules.py
- TierRulesModal.tsx
- test_sales_overview.py
- test_import_core.py
- tiers.py
- intelligence.py
- formatNumber
- CustomerCampaignsPanel.tsx
- parse_datetime
- compilerOptions
- ELINOR IQ v2 — Source Database Discovery
- system/views.py
- customers/views.py
- OrderItem
- rfm.py
- tier_rules.py
- test_internal_accounts.py
- ensure-https.sh script
- test_customer_export.py
- 00-HOME.md
- Internal Accounts — Business Rules
- PosSaleItem
- refresh_rfm_daily
- Command
- test_auth.py
- test_health.py
- nginx-entrypoint.sh
- ELINOR IQ v2 — Core Historical Import
- 3.1 Communication Boundaries
- vite-env.d.ts
- create-superadmin.sh
- backend-entrypoint.sh
- frontend-entrypoint.sh
- scheduler-entrypoint.sh
- restore-database.sh
- scripts/install.sh
- scripts/update.sh
- test_customer_rfm.py
- .execute_hourly
- test_customer_tiers.py
- Project Handoff — Elinor IQ V2
- accounts/views.py
- CustomerRfmSnapshot
- nginx
- Customer Tiers — Business Rules
- ELINOR IQ v2
- test_sql_scores_and_segments_match_python
- ELINOR IQ V2
- scheduler
- frontend
- Elinor IQ V2 — Knowledge Base
- ELINOR IQ V2 — System Architecture Overview
- test_customer_360.py
- healthcheck
- postgres
- IsSuperAdmin
- test_operator_accounts.py
- backend
- 2. Customer master
- Customer RFM — Business Rules
- 0009_seed_confirmed_internal_accounts.py
- InstagramProcessedEvent
- services
- build
- Command
- SmartDirectRuntimeState
- 0002 — Dynamic tiers and the tier-rules modal (Amendment A)
- 0003 — RFM report and the «باشگاه مشتریان» menu (Stage 1)
- ELINOR IQ V2 — Module Registry
- Command
- graphify

## God Nodes (most connected - your core abstractions)
1. `Customer` - 112 edges
2. `Order` - 105 edges
3. `SyncService` - 94 edges
4. `SalesLine` - 90 edges
5. `PosSale` - 89 edges
6. `OrderItem` - 59 edges
7. `PosSaleItem` - 57 edges
8. `Product` - 55 edges
9. `SyncRun` - 52 edges
10. `formatNumber()` - 52 edges

## Surprising Connections (you probably didn't know these)
- `2. Global guard (not configurable)` --references--> `InternalAccount`  [INFERRED]
  docs/business-rules/customer-tiers.md → backend/apps/customers/models.py
- `3. State of the RFM / Customer 360 area` --references--> `exclude_operator_accounts()`  [INFERRED]
  docs/handover/HANDOFF.md → backend/apps/customers/operators.py
- `7. Tier history (`customer_tier_history`)` --references--> `refresh_due_tiers()`  [INFERRED]
  docs/business-rules/customer-tiers.md → backend/apps/customers/tier_refresh.py
- `Context` --references--> `tier_code_for()`  [INFERRED]
  docs/decisions/0001-configurable-tier-rules.md → backend/apps/customers/tiers.py
- `7. Critical Dependencies & Potential Failure Points` --references--> `SyncRun`  [INFERRED]
  docs/architecture/SYSTEM_OVERVIEW.md → backend/apps/integrations/elinor/models.py

## Import Cycles
- None detected.

## Communities (125 total, 41 thin omitted)

### Community 0 - "runner.py"
Cohesion: 0.09
Nodes (33): extract_dump(), _row(), _copy_csv(), _ensure_staging(), _fill_address_labels(), _fill_variant_size_color(), _is_full_import(), load_extracted() (+25 more)

### Community 1 - "types/index.ts"
Cohesion: 0.05
Nodes (58): InternalAccountBanner(), InternalAccountMenu(), KIND_OPTIONS, MarkInternalDialog(), Props, BRONZE, NEUTRAL_TIER_STYLE, TIER_STYLES (+50 more)

### Community 2 - "test_pos_sync.py"
Cohesion: 0.07
Nodes (47): Command, PosDaySync, Meta, branch_day_confirmed(), branch_stored_count(), _day_needs_repair(), earliest_unconfirmed_day(), hourly_sync_days() (+39 more)

### Community 3 - "CustomerListPanel.tsx"
Cohesion: 0.06
Nodes (42): buildCustomerListParams(), CATEGORY_PRESETS, CHANNEL_OPTIONS, CITY_PRESETS, CustomerListFilters, describeCustomerFilters(), DISCOUNT_FILTER_OPTIONS, EMPTY_CUSTOMER_FILTERS (+34 more)

### Community 4 - "django_db"
Cohesion: 0.04
Nodes (27): Migration, Migration, Migration, Migration, Migration, Migration, Migration, _tier() (+19 more)

### Community 5 - "SyncService"
Cohesion: 0.15
Nodes (6): as_bool(), as_int(), extract_list(), _nullable_amount(), _pos_resume_page(), SyncService

### Community 6 - "SalesPage.tsx"
Cohesion: 0.07
Nodes (30): Select(), FilterMultiSelect(), FilterMultiSelectProps, buildSalesKpiParams(), deriveSalesLineFilter(), EMPTY_SALES_FILTERS, findOptionLabel(), hasActiveSalesFilters() (+22 more)

### Community 7 - "SettingsPage.tsx"
Cohesion: 0.13
Nodes (18): PageHeader(), SectionHeader(), ThemeSwitch(), accountRoleLabel(), COVERAGE_TONE, CoverageBranch, coverageCount(), CoverageReport (+10 more)

### Community 8 - "AppShell.tsx"
Cohesion: 0.09
Nodes (39): App(), IconClub(), IconCollapse(), IconCustomers(), IconHome(), IconLogout(), IconProducts(), IconSales() (+31 more)

### Community 9 - "tier_rule_admin.py"
Cohesion: 0.10
Nodes (28): Command, TierRuleSet, Meta, _claim(), _finish(), _is_running(), refresh_due_tiers(), _run_full_refresh() (+20 more)

### Community 10 - "package.json"
Cohesion: 0.07
Nodes (38): dependencies, jalaali-js@^1.2.8, react@^18.3.1, react-dom@^18.3.1, react-router-dom@^6.28.0, devDependencies, autoprefixer@^10.4.20, jsdom@^25.0.1 (+30 more)

### Community 11 - "kpis.py"
Cohesion: 0.13
Nodes (25): _pos_line_total_expr(), _apply_online_payment_filter(), _apply_pos_payment_filter(), _bucket_points(), add(), compute_overview_kpis(), _empty_point(), filtered_online_orders() (+17 more)

### Community 12 - "sales/views.py"
Cohesion: 0.14
Nodes (20): health(), product_360(), product_bundles(), product_list(), product_size_color(), parse_branch_filter(), parse_overview_trend_group(), parse_payment_filter() (+12 more)

### Community 13 - "analysis.py"
Cohesion: 0.17
Nodes (29): exclude_operator_sales(), last_purchase_subquery(), purchase_count_subquery(), _accumulate_daily_amounts(), _accumulate_daily_purchases(), _accumulate_hourly_purchases(), _accumulate_weekday_purchases(), _all_line_metrics() (+21 more)

### Community 15 - "Product"
Cohesion: 0.16
Nodes (16): UserAdmin, Command, Command, Product, Meta, Variant, Meta, _customer() (+8 more)

### Community 16 - "ElinorClient"
Cohesion: 0.17
Nodes (9): fetch_live_actions(), get_campaigns_summary(), _parse_date(), ElinorClient, _safe_json(), extract_object(), extract_paginator(), unwrap_data() (+1 more)

### Community 17 - "sync.py"
Cohesion: 0.12
Nodes (15): Command, Command, Command, SyncCursor, Meta, SyncRun, Meta, clear_stuck_sync_runs() (+7 more)

### Community 18 - "list_query.py"
Cohesion: 0.06
Nodes (55): _add_product_row(), customer_360_payload(), _discounts(), _hydrate_purchase_items(), _item_payload(), _order_receiver_name(), _pos_status(), _pos_status_label() (+47 more)

### Community 19 - "Customer"
Cohesion: 0.11
Nodes (14): Customer, Meta, CustomerQuerySet, bootstrap_window(), admin_user(), api(), auth_api(), test_customer_list_is_paginated() (+6 more)

### Community 20 - "SalesLine"
Cohesion: 0.15
Nodes (13): coverage_payload(), pos_sync_status(), Command, sales_filter_options_payload(), PosSale, Meta, SalesLine, _pos_wallet_sale() (+5 more)

### Community 21 - "JalaliDatePicker.tsx"
Cohesion: 0.17
Nodes (19): JalaliDateField(), JalaliDateRange(), JalaliRangeModal(), shiftMonth(), WEEKDAYS, Point, TrendChart(), IconButton() (+11 more)

### Community 22 - "Customer360Page.tsx"
Cohesion: 0.14
Nodes (25): Badge(), CustomerNameCell(), Pagination(), StatusBadge(), joinFacts(), PROFILE_EMPTY, profileValue(), salesLineTone() (+17 more)

### Community 23 - "home_metrics.py"
Cohesion: 0.17
Nodes (18): _card_values(), home_metric_cards(), home_metric_cards_values(), home_period_window(), _line_values(), _online_gateway_amount(), _online_sales_amount(), parse_home_period() (+10 more)

### Community 24 - "PosSale"
Cohesion: 0.12
Nodes (24): branch_insights(), parse_trend_group(), physical_returns_report(), sales_line_comparison(), _top_product_by_branch(), online_canceled_orders(), online_failed_orders(), online_status_label() (+16 more)

### Community 25 - "django_apps"
Cohesion: 0.08
Nodes (8): AccountsConfig, CoreConfig, CustomersConfig, ElinorConfig, ProductsConfig, SalesConfig, SmartDirectConfig, SystemConfig

### Community 26 - "ingest.py"
Cohesion: 0.16
Nodes (17): addresses_for(), apply_customer_payload(), customer_record(), extract_profile_fields(), _first_text(), normalize_addresses(), _parse_date(), repair_stored_customer_profiles() (+9 more)

### Community 27 - "smart_direct/models.py"
Cohesion: 0.13
Nodes (9): SmartDirectEvent, EventType, Meta, SmartDirectSession, Meta, Status, TemporaryConversationContext, Meta (+1 more)

### Community 28 - "OnlinePayment"
Cohesion: 0.13
Nodes (18): audit_imported(), _inventory_tables_present(), _collect_invoice_dicts(), extract_order_payment_rows(), payment_paid_at(), upsert_order_gateway_payments(), Command, Command (+10 more)

### Community 29 - "dashboard/index.ts"
Cohesion: 0.18
Nodes (19): ChannelMix(), HomePeriodToggle(), KIND_WELL, MetricCardIcons(), MetricSquareCard(), ChangePill(), DeltaMark(), LegendDot() (+11 more)

### Community 30 - "test_customer_tier_rules.py"
Cohesion: 0.11
Nodes (47): preview_draft(), refresh_stored_tiers(), _activate(), _at(), _customer(), _errors(), _legacy_tier(), _orders() (+39 more)

### Community 31 - "TierRulesModal.tsx"
Cohesion: 0.09
Nodes (47): Button(), tierStyle, amountText(), canonical(), CONDITION_KEYS, EditableTier, EMPTY_CONDITION, faDecimal (+39 more)

### Community 32 - "test_sales_overview.py"
Cohesion: 0.18
Nodes (31): sales_line_for_store(), overview_trend_points(), _customer(), _online(), _online_item(), _pos(), _pos_item(), test_color_and_size_aggregation() (+23 more)

### Community 33 - "test_import_core.py"
Cohesion: 0.18
Nodes (15): CustomerAddress, Meta, _customer(), _ids(), _online(), _pos(), _row(), test_customer_list_default_is_all_customers() (+7 more)

### Community 34 - "tiers.py"
Cohesion: 0.08
Nodes (37): CustomerTierHistory, Meta, _fa_count(), _order(), _preview_payload(), _preview_warnings(), _scored_sql(), active_rule_set() (+29 more)

### Community 35 - "intelligence.py"
Cohesion: 0.19
Nodes (14): _generate_action_recommendation(), _get_or_create_bucket(), product_360_report(), product_bundles_report(), product_intelligence_report(), product_size_color_intelligence(), _add_variant_count(), size_color_report() (+6 more)

### Community 36 - "formatNumber"
Cohesion: 0.16
Nodes (31): chartValue(), formatAxisValue(), formatTooltipLabel(), MixLine, RevenueChart(), RevenueChartMetric, TargetGauge(), rfmSegment() (+23 more)

### Community 37 - "CustomerCampaignsPanel.tsx"
Cohesion: 0.11
Nodes (27): EmptyState(), ErrorState(), Skeleton(), Table(), TableRow(), Panel(), BRANCH_OPTIONS, CustomerCampaignsPanel() (+19 more)

### Community 38 - "parse_datetime"
Cohesion: 0.28
Nodes (5): add_row(), parse_datetime(), local_row_day(), test_parse_elinor_datetime(), test_throttle_detection()

### Community 39 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 40 - "ELINOR IQ v2 — Source Database Discovery"
Cohesion: 0.06
Nodes (32): 10. Required-now tables, 11. Useful-later tables, 12. Not-needed-currently tables, 13. Proposed ELINOR IQ v2 target model, 14. Data-quality issues, 15. Unresolved questions, 1. Source database overview, 3. Online sales schema (+24 more)

### Community 41 - "system/views.py"
Cohesion: 0.11
Nodes (23): User, Meta, current_elinor_credentials(), ElinorApiConfig, Meta, admins(), api_config(), _public_sync_error() (+15 more)

### Community 42 - "customers/views.py"
Cohesion: 0.10
Nodes (40): product_history(), iter_export_row_batches(), account_payload(), _clean_kind(), _clean_note(), create_or_reactivate(), internal_account_payload(), InternalAccountError (+32 more)

### Community 43 - "OrderItem"
Cohesion: 0.22
Nodes (7): ElinorApiError, OrderItem, Meta, _order(), test_details_sync_is_limited_resumable_and_idempotent(), test_failed_order_detail_is_not_marked_synced(), fail()

### Community 44 - "rfm.py"
Cohesion: 0.12
Nodes (14): customer_rfm_payload(), _internal_accounts_count(), internal_signals_payload(), _local_midnight(), _normalized(), _pct(), rfm_facts_sql(), rfm_summary() (+6 more)

### Community 45 - "tier_rules.py"
Cohesion: 0.13
Nodes (15): _compare(), _condition(), _enabled_conditions(), evaluate_tier(), _fa(), _fa_amount(), _fa_number(), _normalize_condition() (+7 more)

### Community 46 - "test_internal_accounts.py"
Cohesion: 0.26
Nodes (18): CustomerRfm, Meta, _at(), _customer(), _order(), _pos(), _signals(), super_admin() (+10 more)

### Community 47 - "ensure-https.sh script"
Cohesion: 0.22
Nodes (7): set_env(), change-domain.sh script, DEBIAN_FRONTEND, install.sh script, set_env(), ensure-https.sh script, update.sh script

### Community 48 - "test_customer_export.py"
Cohesion: 0.08
Nodes (22): format_jalali_date(), format_jalali_datetime(), to_jalali(), to_local_datetime(), export_row_cells(), export_status_label(), iter_customer_export_csv(), _customer() (+14 more)

### Community 49 - "00-HOME.md"
Cohesion: 0.16
Nodes (8): 1. Methodology & Evaluation Dimensions, ELINOR IQ V2 — Feature Verification Matrix, Traceability Categories, Environment, Meta Developer Dashboard, Production limits, Public HTTPS callback, Smart Direct — Instagram connection

### Community 50 - "Internal Accounts — Business Rules"
Cohesion: 0.29
Nodes (7): canonical_mobile(), 1. Definition, 2. Exclusion scope (identical for desk and staff), 3. Detection signals (flags only; nothing is excluded automatically), 4. Confirm and restore (super admin only), 5. Confirmed accounts, Internal Accounts — Business Rules

### Community 51 - "PosSaleItem"
Cohesion: 0.08
Nodes (26): City, Meta, CustomerLevel, Meta, CustomerRole, Meta, Province, Meta (+18 more)

### Community 52 - "refresh_rfm_daily"
Cohesion: 0.13
Nodes (10): Command, backfill_snapshots(), jalali_month_end(), jalali_month_key(), previous_month_keys(), refresh_rfm_daily(), _scored_sql(), write_snapshot() (+2 more)

### Community 56 - "nginx-entrypoint.sh"
Cohesion: 0.83
Nodes (3): frontend_location(), proxy_locations(), nginx-entrypoint.sh script

### Community 57 - "ELINOR IQ v2 — Core Historical Import"
Cohesion: 0.10
Nodes (19): Architecture, Branch mapping, CLI, Compatibility notes, Customer identity, Data-quality findings, Date ranges (stored UTC), ELINOR IQ v2 — Core Historical Import (+11 more)

### Community 58 - "3.1 Communication Boundaries"
Cohesion: 0.33
Nodes (4): api_exception_handler(), 3.1 Communication Boundaries, 3.2 Primary API Endpoint Routing (`backend/config/urls.py`), 3. Backend / Frontend Boundaries & API Contracts

### Community 91 - "test_customer_rfm.py"
Cohesion: 0.32
Nodes (15): refresh_rfm(), _at(), _buyer(), _customer(), _order(), _pos(), _rows(), test_as_of_today_equals_the_tier_facts_and_past_as_of_excludes_later_purchases() (+7 more)

### Community 93 - "test_customer_tiers.py"
Cohesion: 0.32
Nodes (14): _at(), _customer(), _item(), _metrics(), _online(), _pos(), test_daily_tier_refresh_runs_once_per_day(), test_exchange_refund_shipping_and_discount_do_not_follow_sales_counts() (+6 more)

### Community 94 - "Project Handoff — Elinor IQ V2"
Cohesion: 0.13
Nodes (14): 1. Current priority, 2026-10-24 — Orientation and handoff created, 2026-10-24 — Tier rules: Phase 1, Amendment A and Correction, 2026-10-25 — Confirmed internal accounts registered (uncommitted), 2026-10-25 — RFM Stage 1, club menu and internal accounts (uncommitted), 2. Workflow, 3. State of the RFM / Customer 360 area, 4. Knowledge infrastructure (+6 more)

### Community 95 - "accounts/views.py"
Cohesion: 0.33
Nodes (7): is_super_admin(), csrf(), login_view(), logout_view(), me(), _user_payload(), 1. Accounts & Authentication Module (`apps.accounts`)

### Community 96 - "CustomerRfmSnapshot"
Cohesion: 0.29
Nodes (6): CustomerRfmSnapshot, Meta, movement_payload(), _customer(), test_movement_excludes_active_internal_accounts_at_read_time(), test_seed_is_idempotent_skips_missing_and_keeps_existing_rows()

### Community 97 - "nginx"
Cohesion: 0.18
Nodes (11): condition, backend, frontend, condition, depends_on, entrypoint, image, ports (+3 more)

### Community 98 - "Customer Tiers — Business Rules"
Cohesion: 0.18
Nodes (11): 1. Facts per customer (fixed), 2. Global guard (not configurable), 3. Rule shape, 4. Version 1 (identical to the rules before versioning), 5. Summary text, 6. Versions and activation, 7. Tier history (`customer_tier_history`), Codes and titles (+3 more)

### Community 99 - "ELINOR IQ v2"
Cohesion: 0.20
Nodes (9): Authentication, Development workflow, Elinor API integration, ELINOR IQ v2, Environment, Known API limitations, Project structure, Requirements (+1 more)

### Community 100 - "test_sql_scores_and_segments_match_python"
Cohesion: 0.28
Nodes (8): f_score(), m_score(), r_score(), test_every_rf_cell_maps_to_one_segment(), test_f_score_boundaries(), test_m_score_boundaries(), test_r_score_boundaries(), test_sql_scores_and_segments_match_python()

### Community 101 - "ELINOR IQ V2"
Cohesion: 0.22
Nodes (8): Active modules (`backend/config/settings.py` INSTALLED_APPS), AI Collaboration, Shared Workspace & Knowledge Preservation, Documentation entrypoints (open only what the task needs), ELINOR IQ V2, Progressive context loading, Stack (verified from source), Targeted search rules, Working rules

### Community 102 - "scheduler"
Cohesion: 0.22
Nodes (9): depends_on, postgres, condition, depends_on, entrypoint, env_file, restart, volumes (+1 more)

### Community 103 - "frontend"
Cohesion: 0.22
Nodes (9): DJANGO_DEBUG, DOMAIN, VITE_API_BASE_URL, depends_on, environment, restart, volumes, environment (+1 more)

### Community 104 - "Elinor IQ V2 — Knowledge Base"
Cohesion: 0.22
Nodes (9): Architecture, Business Rules, Decisions, Elinor IQ V2 — Knowledge Base, Existing Documentation, Generated Graph, Handover, Implementation Status (+1 more)

### Community 105 - "ELINOR IQ V2 — System Architecture Overview"
Cohesion: 0.22
Nodes (9): 1. Executive Summary & Purpose, 2.1 Core Technologies, 2.2 Container Responsibilities & Topology, 2. Technology Stack & Deployment Topology, 4.2 Batch Historical Import Pipeline, 4. Data Ingestion Architecture & Upstream Relationships, 6. Integration Boundaries & External Interfaces, 7. Critical Dependencies & Potential Failure Points (+1 more)

### Community 106 - "test_customer_360.py"
Cohesion: 0.43
Nodes (6): _customer(), _item(), _online(), _pos(), _pos_item(), test_customer_360_unified_history_and_profile()

### Community 107 - "healthcheck"
Cohesion: 0.50
Nodes (8): healthcheck, healthcheck, interval, retries, start_period, test, timeout, healthcheck

### Community 108 - "postgres"
Cohesion: 0.25
Nodes (8): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, environment, image, restart, volumes, postgres

### Community 109 - "IsSuperAdmin"
Cohesion: 0.29
Nodes (5): IsSuperAdmin, 0001 — Configurable customer tier rules (Phase 1), Consequences, Context, Decisions

### Community 110 - "test_operator_accounts.py"
Cohesion: 0.62
Nodes (5): _buyer(), _desk(), _order(), test_desk_account_stays_in_the_list_without_a_tier(), test_desk_orders_stay_in_sales_and_show_the_receiver()

### Community 111 - "backend"
Cohesion: 0.29
Nodes (7): env_file, environment, restart, volumes, POSTGRES_HOST, environment, backend

### Community 112 - "2. Customer master"
Cohesion: 0.29
Nodes (7): 2. Customer master, Addresses, Canonical table: `customers`, Club / level lookup, Customer quality snapshot (tuple counts), Guest / staff / operational, How every sales system references customers

### Community 113 - "Customer RFM — Business Rules"
Cohesion: 0.33
Nodes (6): 1. Facts (shared with tiers, not forked), 2. Scores (fixed constants, provisional), 3. Segments (from R and F; every cell maps to exactly one), 4. Storage and refresh, 5. Report definitions (`GET /api/customers/rfm/summary/`), Customer RFM — Business Rules

### Community 114 - "0009_seed_confirmed_internal_accounts.py"
Cohesion: 0.50
Nodes (3): _confirmed(), Migration, seed_confirmed_accounts()

### Community 115 - "InstagramProcessedEvent"
Cohesion: 0.40
Nodes (3): InstagramProcessedEvent, Kind, Meta

### Community 116 - "services"
Cohesion: 0.40
Nodes (4): services, volumes, frontend_node_modules, postgres_data

### Community 117 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 120 - "0002 — Dynamic tiers and the tier-rules modal (Amendment A)"
Cohesion: 0.50
Nodes (4): 0002 — Dynamic tiers and the tier-rules modal (Amendment A), Consequences, Context, Decisions

### Community 121 - "0003 — RFM report and the «باشگاه مشتریان» menu (Stage 1)"
Cohesion: 0.50
Nodes (4): 0003 — RFM report and the «باشگاه مشتریان» menu (Stage 1), Consequences, Context, Decisions

### Community 122 - "ELINOR IQ V2 — Module Registry"
Cohesion: 0.50
Nodes (4): 8. Smart Direct (`apps.smart_direct`) — RETIRED, 9. Frontend Web Application (`frontend/src`), ELINOR IQ V2 — Module Registry, Navigation & Cross-References

## Knowledge Gaps
- **2 isolated node(s):** `/Users/rezasoltani/.local/bin/graphify-mcp`, `DEBIAN_FRONTEND`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 622 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `3. Customer Master, RFM Tiers & 360 Profile (`apps.customers`)` connect `customers/views.py` to `CustomerRfmSnapshot`, `tiers.py`, `CustomerListPanel.tsx`, `test_sql_scores_and_segments_match_python`, `CustomerCampaignsPanel.tsx`, `tier_rule_admin.py`, `OrderItem`, `IsSuperAdmin`, `tier_rules.py`, `list_query.py`, `Customer`, `PosSaleItem`, `refresh_rfm_daily`, `SalesLine`, `ELINOR IQ V2 — Module Registry`, `OnlinePayment`, `test_customer_tier_rules.py`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Are the 67 inferred relationships involving `Customer` (e.g. with `home_summary()` and `repair_stored_customer_profiles()`) actually correct?**
  _`Customer` has 67 INFERRED edges - model-reasoned connections that need verification._
- **What connects `/Users/rezasoltani/.local/bin/graphify-mcp`, `DEBIAN_FRONTEND` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `runner.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08735150244584207 - nodes in this community are weakly interconnected._
- **Why does `TierBadge()` connect `CustomerCampaignsPanel.tsx` to `types/index.ts`, `customers/views.py`, `Customer360Page.tsx`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Order` (e.g. with `home_summary()` and `_apply_city_filter()`) actually correct?**
  _`Order` has 63 INFERRED edges - model-reasoned connections that need verification._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05070422535211268 - nodes in this community are weakly interconnected._