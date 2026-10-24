# Graph Report - elinor-iq-v2  (2026-10-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1506 nodes · 4606 edges · 91 communities (54 shown, 37 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 465 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3bc0a488`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- runner.py
- types/index.ts
- test_pos_sync.py
- CustomerListPanel.tsx
- sales/models.py
- SyncService
- SalesPage.tsx
- SettingsPage.tsx
- AppShell.tsx
- test_customer_tiers.py
- package.json
- kpis.py
- sales/views.py
- analysis.py
- accounts/views.py
- Product
- ElinorClient
- sync.py
- detail.py
- Order
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
- django_db_models_deletion
- list_query.py
- test_sales_overview.py
- test_import_core.py
- tiers.py
- intelligence.py
- formatNumber
- CustomerCampaignsPanel.tsx
- parse_datetime
- compilerOptions
- conftest.py
- system/views.py
- customers/views.py
- OrderItem
- test_platform_access.py
- test_customer_list.py
- test_sales_analysis.py
- ensure-https.sh script
- test_customer_export.py
- dates.py
- operators.py
- City
- export.py
- Command
- test_auth.py
- test_health.py
- nginx-entrypoint.sh
- 0002_super_admin_role.py
- vite-env.d.ts
- create-superadmin.sh
- backend-entrypoint.sh
- frontend-entrypoint.sh
- scheduler-entrypoint.sh
- restore-database.sh
- scripts/install.sh
- scripts/update.sh

## God Nodes (most connected - your core abstractions)
1. `Order` - 92 edges
2. `SyncService` - 92 edges
3. `Customer` - 89 edges
4. `SalesLine` - 82 edges
5. `PosSale` - 75 edges
6. `OrderItem` - 54 edges
7. `Product` - 50 edges
8. `PosSaleItem` - 49 edges
9. `SyncRun` - 48 edges
10. `Variant` - 37 edges

## Surprising Connections (you probably didn't know these)
- `install.sh script` --calls--> `ensure-https.sh script`  [EXTRACTED]
  install.sh → scripts/ensure-https.sh
- `update.sh script` --calls--> `ensure-https.sh script`  [EXTRACTED]
  update.sh → scripts/ensure-https.sh
- `Command` --uses--> `OnlinePayment`  [INFERRED]
  backend/apps/integrations/elinor/management/commands/import_elinor_gateway_payments.py → backend/apps/sales/models.py
- `admins()` --uses--> `User`  [INFERRED]
  backend/apps/system/views.py → backend/apps/accounts/models.py
- `Command` --uses--> `Customer`  [INFERRED]
  backend/apps/integrations/elinor/management/commands/sync_elinor_bootstrap.py → backend/apps/customers/models.py

## Import Cycles
- None detected.

## Communities (91 total, 37 thin omitted)

### Community 0 - "runner.py"
Cohesion: 0.06
Nodes (38): extract_dump(), _row(), _copy_csv(), _ensure_staging(), _fill_address_labels(), _fill_variant_size_color(), _is_full_import(), load_extracted() (+30 more)

### Community 1 - "types/index.ts"
Cohesion: 0.05
Nodes (55): api(), ApiError, getCsrfToken(), queryPath(), authService, customerExportQuery(), customerListQuery(), serializeFilterParams() (+47 more)

### Community 2 - "test_pos_sync.py"
Cohesion: 0.08
Nodes (41): Command, PosDaySync, Meta, branch_day_confirmed(), branch_stored_count(), _day_needs_repair(), earliest_unconfirmed_day(), hourly_sync_days() (+33 more)

### Community 3 - "CustomerListPanel.tsx"
Cohesion: 0.08
Nodes (33): buildCustomerListParams(), CATEGORY_PRESETS, CHANNEL_OPTIONS, CITY_PRESETS, CustomerListFilters, describeCustomerFilters(), DISCOUNT_FILTER_OPTIONS, EMPTY_CUSTOMER_FILTERS (+25 more)

### Community 4 - "sales/models.py"
Cohesion: 0.06
Nodes (20): Migration, Migration, Migration, CustomerLevel, Meta, CustomerQuerySet, CustomerRole, Meta (+12 more)

### Community 5 - "SyncService"
Cohesion: 0.13
Nodes (6): Command, _cursor(), local_row_day(), _pos_resume_page(), recent_window(), SyncService

### Community 6 - "SalesPage.tsx"
Cohesion: 0.08
Nodes (25): Table(), TableRow(), Select(), FilterMultiSelect(), FilterMultiSelectProps, buildSalesKpiParams(), deriveSalesLineFilter(), EMPTY_SALES_FILTERS (+17 more)

### Community 7 - "SettingsPage.tsx"
Cohesion: 0.10
Nodes (28): App(), Button(), Input(), PageHeader(), Panel(), SearchInput(), SectionHeader(), ThemeSwitch() (+20 more)

### Community 8 - "AppShell.tsx"
Cohesion: 0.12
Nodes (30): IconCollapse(), IconCustomers(), IconHome(), IconLogout(), IconProducts(), IconSales(), IconSettings(), CoverageNotice() (+22 more)

### Community 9 - "test_customer_tiers.py"
Cohesion: 0.12
Nodes (25): Command, _claim(), _finish(), _is_running(), refresh_due_tiers(), _run_full_refresh(), start_full_tier_refresh(), tier_refresh_status() (+17 more)

### Community 10 - "package.json"
Cohesion: 0.05
Nodes (36): dependencies, jalaali-js, react, react-dom, react-router-dom, devDependencies, autoprefixer, jsdom (+28 more)

### Community 11 - "kpis.py"
Cohesion: 0.12
Nodes (27): _ordered_bucket_keys_extended(), _pct_change(), _pos_line_total_expr(), _apply_online_payment_filter(), _apply_pos_payment_filter(), _bucket_points(), add(), compute_overview_kpis() (+19 more)

### Community 12 - "sales/views.py"
Cohesion: 0.15
Nodes (18): health(), product_360(), product_bundles(), product_list(), product_size_color(), parse_branch_filter(), parse_overview_trend_group(), parse_payment_filter() (+10 more)

### Community 13 - "analysis.py"
Cohesion: 0.16
Nodes (30): exclude_operator_sales(), operator_customer_ids(), last_purchase_subquery(), purchase_count_subquery(), _accumulate_daily_amounts(), _accumulate_daily_purchases(), _accumulate_hourly_purchases(), _accumulate_weekday_purchases() (+22 more)

### Community 14 - "accounts/views.py"
Cohesion: 0.08
Nodes (9): User, Meta, is_super_admin(), IsSuperAdmin, csrf(), login_view(), logout_view(), me() (+1 more)

### Community 15 - "Product"
Cohesion: 0.13
Nodes (23): Command, Command, Color, Meta, Product, Meta, ProductAttribute, Meta (+15 more)

### Community 16 - "ElinorClient"
Cohesion: 0.15
Nodes (10): fetch_live_actions(), get_campaigns_summary(), _parse_date(), ElinorClient, _safe_json(), extract_object(), extract_paginator(), unwrap_data() (+2 more)

### Community 17 - "sync.py"
Cohesion: 0.14
Nodes (11): Command, Command, Command, SyncCursor, Meta, SyncRun, Meta, clear_stuck_sync_runs() (+3 more)

### Community 18 - "detail.py"
Cohesion: 0.14
Nodes (24): _add_product_row(), customer_360_payload(), _discounts(), _hydrate_purchase_items(), _item_payload(), _order_receiver_name(), _pos_status(), _pos_status_label() (+16 more)

### Community 19 - "Order"
Cohesion: 0.14
Nodes (15): Customer, Meta, refresh_stored_tiers(), Order, Meta, test_customer_list_is_paginated(), test_home_and_sales_use_date_range(), _customer() (+7 more)

### Community 20 - "SalesLine"
Cohesion: 0.13
Nodes (13): coverage_payload(), pos_sync_status(), Command, sales_filter_options_payload(), OnlineInvoice, Meta, SalesLine, _pos_wallet_sale() (+5 more)

### Community 21 - "JalaliDatePicker.tsx"
Cohesion: 0.17
Nodes (19): JalaliDateField(), JalaliDateRange(), JalaliRangeModal(), shiftMonth(), WEEKDAYS, Point, TrendChart(), IconButton() (+11 more)

### Community 22 - "Customer360Page.tsx"
Cohesion: 0.19
Nodes (24): EmptyState(), Badge(), CustomerNameCell(), Pagination(), StatusBadge(), joinFacts(), PROFILE_EMPTY, profileValue() (+16 more)

### Community 23 - "home_metrics.py"
Cohesion: 0.15
Nodes (21): _card_values(), home_metric_cards(), home_metric_cards_values(), home_period_window(), _line_values(), _online_gateway_amount(), _online_sales_amount(), parse_home_period() (+13 more)

### Community 24 - "PosSale"
Cohesion: 0.17
Nodes (19): physical_returns_report(), PosSale, Meta, online_canceled_orders(), online_failed_orders(), online_status_label(), online_wait_for_payment_orders(), pos_cancelled_sales() (+11 more)

### Community 25 - "django_apps"
Cohesion: 0.08
Nodes (8): AccountsConfig, CoreConfig, CustomersConfig, ElinorConfig, ProductsConfig, SalesConfig, SmartDirectConfig, SystemConfig

### Community 26 - "ingest.py"
Cohesion: 0.17
Nodes (15): addresses_for(), apply_customer_payload(), customer_record(), extract_profile_fields(), _first_text(), normalize_addresses(), repair_stored_customer_profiles(), upsert_customer_from_source() (+7 more)

### Community 27 - "smart_direct/models.py"
Cohesion: 0.08
Nodes (13): InstagramProcessedEvent, Kind, Meta, SmartDirectEvent, EventType, Meta, SmartDirectRuntimeState, Meta (+5 more)

### Community 28 - "OnlinePayment"
Cohesion: 0.17
Nodes (12): _collect_invoice_dicts(), extract_order_payment_rows(), payment_paid_at(), upsert_order_gateway_payments(), Command, Command, OnlinePayment, Meta (+4 more)

### Community 29 - "dashboard/index.ts"
Cohesion: 0.18
Nodes (19): ChannelMix(), HomePeriodToggle(), KIND_WELL, MetricCardIcons(), MetricSquareCard(), ChangePill(), DeltaMark(), LegendDot() (+11 more)

### Community 30 - "django_db_models_deletion"
Cohesion: 0.10
Nodes (9): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+1 more)

### Community 31 - "list_query.py"
Cohesion: 0.20
Nodes (21): _apply_category_filter(), _apply_city_filter(), _apply_discount_filter(), _apply_order_behavior_filter(), _apply_payment_method_filter(), _apply_profile_state_filter(), _apply_search(), _apply_size_filter() (+13 more)

### Community 32 - "test_sales_overview.py"
Cohesion: 0.27
Nodes (19): sales_line_for_store(), overview_trend_points(), _customer(), _online(), _online_item(), _pos(), _pos_item(), test_date_filtering() (+11 more)

### Community 33 - "test_import_core.py"
Cohesion: 0.17
Nodes (14): CustomerAddress, Meta, _customer(), _item(), _online(), _pos(), _pos_item(), test_customer_360_unified_history_and_profile() (+6 more)

### Community 34 - "tiers.py"
Cohesion: 0.18
Nodes (15): application_today(), clear_operator_tiers(), _earliest(), _fact_params(), _facts_sql(), _latest(), _line_total(), metrics_for_customers() (+7 more)

### Community 35 - "intelligence.py"
Cohesion: 0.18
Nodes (14): _generate_action_recommendation(), _get_or_create_bucket(), product_360_report(), product_bundles_report(), product_intelligence_report(), product_size_color_intelligence(), _add_variant_count(), size_color_report() (+6 more)

### Community 36 - "formatNumber"
Cohesion: 0.28
Nodes (16): chartValue(), formatAxisValue(), formatTooltipLabel(), MixLine, RevenueChart(), RevenueChartMetric, TargetGauge(), formatCompactToman() (+8 more)

### Community 37 - "CustomerCampaignsPanel.tsx"
Cohesion: 0.17
Nodes (17): ErrorState(), Skeleton(), BRANCH_OPTIONS, CustomerCampaignsPanel(), GIFT_PRESETS, LINE_COLORS, CustomerReportsPanel(), Population() (+9 more)

### Community 38 - "parse_datetime"
Cohesion: 0.22
Nodes (8): _parse_date(), add_row(), as_bool(), as_int(), extract_list(), parse_datetime(), _nullable_amount(), test_parse_elinor_datetime()

### Community 39 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 40 - "conftest.py"
Cohesion: 0.15
Nodes (7): UserAdmin, bootstrap_window(), admin_user(), api(), auth_api(), test_bootstrap_upsert_is_idempotent(), test_bootstrap_window_is_about_three_months()

### Community 41 - "system/views.py"
Cohesion: 0.23
Nodes (10): admins(), api_config(), _public_sync_error(), _run_pos_range(), _run_recent_sync(), status_view(), stop_sync(), sync_coverage() (+2 more)

### Community 42 - "customers/views.py"
Cohesion: 0.27
Nodes (12): product_history(), iter_export_row_batches(), paginate_customers(), customer_campaigns(), customer_detail(), customer_export(), customer_list(), customer_products() (+4 more)

### Community 43 - "OrderItem"
Cohesion: 0.17
Nodes (8): ElinorApiError, Command, OrderItem, Meta, _order(), test_details_sync_is_limited_resumable_and_idempotent(), test_failed_order_detail_is_not_marked_synced(), fail()

### Community 44 - "test_platform_access.py"
Cohesion: 0.21
Nodes (8): current_elinor_credentials(), ElinorApiConfig, Meta, super_admin(), super_api(), test_blank_api_password_keeps_the_saved_one(), test_layer_two_admin_cannot_manage_platform(), test_super_admin_saves_api_and_creates_layer_two_admin()

### Community 45 - "test_customer_list.py"
Cohesion: 0.27
Nodes (11): Category, Meta, ProductCategory, Meta, _customer(), _ids(), _online(), _pos() (+3 more)

### Community 46 - "test_sales_analysis.py"
Cohesion: 0.51
Nodes (12): _customer(), _online(), _online_item(), _pos(), _pos_item(), test_color_and_size_aggregation(), test_core_metrics_respects_sales_line_filter(), test_product_aggregation_and_filters() (+4 more)

### Community 47 - "ensure-https.sh script"
Cohesion: 0.22
Nodes (7): set_env(), change-domain.sh script, DEBIAN_FRONTEND, install.sh script, set_env(), ensure-https.sh script, update.sh script

### Community 48 - "test_customer_export.py"
Cohesion: 0.47
Nodes (8): _customer(), _online(), _pos(), _read_csv(), test_customer_export_includes_every_filtered_row(), test_customer_export_requires_auth(), test_customer_export_respects_filters(), test_customer_export_returns_csv_with_all_columns()

### Community 49 - "dates.py"
Cohesion: 0.50
Nodes (6): format_jalali_date(), format_jalali_datetime(), to_jalali(), to_local_datetime(), test_jalali_empty_values(), test_jalali_numeric_and_long_formats()

### Community 50 - "operators.py"
Cohesion: 0.48
Nodes (5): canonical_mobile(), exclude_operator_accounts(), is_operator_account(), operator_customers(), operator_mobile_variants()

### Community 51 - "City"
Cohesion: 0.27
Nodes (4): City, Meta, Province, Meta

### Community 52 - "export.py"
Cohesion: 0.60
Nodes (3): export_row_cells(), export_status_label(), iter_customer_export_csv()

### Community 56 - "nginx-entrypoint.sh"
Cohesion: 0.83
Nodes (3): frontend_location(), proxy_locations(), nginx-entrypoint.sh script

## Knowledge Gaps
- **10 isolated node(s):** `autoprefixer`, `jsdom`, `postcss`, `tailwindcss`, `@types/jalaali-js` (+5 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 396 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SyncService` connect `SyncService` to `test_pos_sync.py`, `sales/models.py`, `parse_datetime`, `conftest.py`, `system/views.py`, `OrderItem`, `Product`, `ElinorClient`, `sync.py`, `Order`, `PosSale`, `ingest.py`, `OnlinePayment`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `Order` (e.g. with `home_summary()` and `_apply_city_filter()`) actually correct?**
  _`Order` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `autoprefixer`, `jsdom`, `postcss` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `runner.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05578947368421053 - nodes in this community are weakly interconnected._
- **Why does `Customer` connect `Order` to `test_pos_sync.py`, `sales/models.py`, `SyncService`, `test_customer_tiers.py`, `kpis.py`, `analysis.py`, `Product`, `sync.py`, `SalesLine`, `home_metrics.py`, `ingest.py`, `list_query.py`, `test_sales_overview.py`, `test_import_core.py`, `tiers.py`, `conftest.py`, `system/views.py`, `customers/views.py`, `OrderItem`, `test_customer_list.py`, `test_sales_analysis.py`, `test_customer_export.py`, `operators.py`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `SyncService` (e.g. with `Command` and `Command`) actually correct?**
  _`SyncService` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053555750658472345 - nodes in this community are weakly interconnected._