# Customer

> God node · 89 connections · `backend/apps/customers/models.py`

**Community:** [Order](Order.md)

## Connections by Relation

### contains
- customers/models.py `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- [analysis.py](analysis.py.md) `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [list_query.py](list_query.py.md) `EXTRACTED`
- [test_pos_sync.py](test_pos_sync.py.md) `EXTRACTED`
- [tiers.py](tiers.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
- [customers/views.py](customers-views.py.md) `EXTRACTED`
- [test_sales_analysis.py](test_sales_analysis.py.md) `EXTRACTED`
- [test_customer_tiers.py](test_customer_tiers.py.md) `EXTRACTED`
- [conftest.py](conftest.py.md) `EXTRACTED`
- core/views.py `EXTRACTED`
- [test_customer_list.py](test_customer_list.py.md) `EXTRACTED`
- [test_import_core.py](test_import_core.py.md) `EXTRACTED`
- test_sales_kpis.py `EXTRACTED`
- test_product_intelligence.py `EXTRACTED`
- campaigns.py `EXTRACTED`
- test_customer_360.py `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- [operators.py](operators.py.md) `EXTRACTED`
- *…and 15 more `imports` connection(s) not listed (lowest-degree first to go)*

### method
- .full_name() `EXTRACTED`
- .is_purchasing() `EXTRACTED`

### uses
- [SyncService](SyncService.md) `INFERRED`
- customer_list_queryset() `INFERRED`
- status_view() `INFERRED`
- home_summary() `INFERRED`
- audit_imported() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- _customer() `INFERRED`
- upsert_customer_from_source() `INFERRED`
- test_failed_order_detail_is_not_marked_synced() `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- _customer() `INFERRED`
- reports() `INFERRED`
- test_customer_sync_paginated_resumable_and_idempotent() `INFERRED`
- test_customer_sync_resumes_from_saved_page() `INFERRED`
- _customer() `INFERRED`
- test_repair_mismatched_pos_day_syncs() `INFERRED`
- repair_stored_customer_profiles() `INFERRED`
- *…and 30 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*