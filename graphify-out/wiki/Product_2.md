# Product

> God node · 50 connections · `backend/apps/products/models.py`

**Community:** [Product](Product.md)

## Connections by Relation

### contains
- products/models.py `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
- [test_sales_analysis.py](test_sales_analysis.py.md) `EXTRACTED`
- [intelligence.py](intelligence.py.md) `EXTRACTED`
- [conftest.py](conftest.py.md) `EXTRACTED`
- [test_customer_list.py](test_customer_list.py.md) `EXTRACTED`
- [test_import_core.py](test_import_core.py.md) `EXTRACTED`
- test_sales_kpis.py `EXTRACTED`
- test_product_intelligence.py `EXTRACTED`
- test_customer_360.py `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- audit.py `EXTRACTED`
- test_sync.py `EXTRACTED`
- sync_elinor_bootstrap.py `EXTRACTED`
- sync_elinor_recent.py `EXTRACTED`
- test_products_and_coverage.py `EXTRACTED`
- sync_elinor_details.py `EXTRACTED`
- products/admin.py `EXTRACTED`

### uses
- [SyncService](SyncService.md) `INFERRED`
- status_view() `INFERRED`
- audit_imported() `INFERRED`
- test_customer_list_diverse_filters_and_sorting() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- test_customer_360_unified_history_and_profile() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- product_360_report() `INFERRED`
- test_product_list_channel_filtering() `INFERRED`
- test_product_list_combines_online_and_pos() `INFERRED`
- test_core_metrics_respects_sales_line_filter() `INFERRED`
- test_product_aggregation_and_filters() `INFERRED`
- test_weekday_and_hourly_grouping() `INFERRED`
- test_color_and_size_aggregation() `INFERRED`
- test_refund_exchange_counts_and_item_breakdown() `INFERRED`
- test_sales_line_comparison_with_new_repeat_and_previous() `INFERRED`
- *…and 9 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*