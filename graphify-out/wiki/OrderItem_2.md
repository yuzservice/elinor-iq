# OrderItem

> God node · 54 connections · `backend/apps/sales/models.py`

**Community:** [OrderItem](OrderItem.md)

## Connections by Relation

### contains
- [sales/models.py](sales-models.py.md) `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- [analysis.py](analysis.py.md) `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [list_query.py](list_query.py.md) `EXTRACTED`
- semantics.py `EXTRACTED`
- [detail.py](detail.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
- [test_sales_analysis.py](test_sales_analysis.py.md) `EXTRACTED`
- [intelligence.py](intelligence.py.md) `EXTRACTED`
- [test_customer_tiers.py](test_customer_tiers.py.md) `EXTRACTED`
- [conftest.py](conftest.py.md) `EXTRACTED`
- core/views.py `EXTRACTED`
- [test_customer_list.py](test_customer_list.py.md) `EXTRACTED`
- [test_import_core.py](test_import_core.py.md) `EXTRACTED`
- test_sales_kpis.py `EXTRACTED`
- test_product_intelligence.py `EXTRACTED`
- test_customer_360.py `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- audit.py `EXTRACTED`
- test_sync.py `EXTRACTED`
- *…and 5 more `imports` connection(s) not listed (lowest-degree first to go)*

### method
- .display_title() `EXTRACTED`

### rationale_for
- Online order line. Conceptual OnlineOrderItem. Table remains `order_items`. `EXTRACTED`

### uses
- [SyncService](SyncService.md) `INFERRED`
- qualifying_online_items() `INFERRED`
- status_view() `INFERRED`
- home_summary() `INFERRED`
- audit_imported() `INFERRED`
- test_customer_list_diverse_filters_and_sorting() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_failed_order_detail_is_not_marked_synced() `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- test_exchange_refund_shipping_and_discount_do_not_follow_sales_counts() `INFERRED`
- test_products_api_is_sales_focused_without_inventory() `INFERRED`
- _product_history() `INFERRED`
- _online_item() `INFERRED`
- _online_item() `INFERRED`
- _hydrate_purchase_items() `INFERRED`
- _online_item() `INFERRED`
- *…and 5 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*