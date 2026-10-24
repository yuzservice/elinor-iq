# Order

> God node · 92 connections · `backend/apps/sales/models.py`

**Community:** [Order](Order.md)

## Connections by Relation

### contains
- [sales/models.py](sales-models.py.md) `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- services.py `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [list_query.py](list_query.py.md) `EXTRACTED`
- semantics.py `EXTRACTED`
- [tiers.py](tiers.py.md) `EXTRACTED`
- [kpis.py](kpis.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
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
- gateway_payments.py `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- *…and 15 more `imports` connection(s) not listed (lowest-degree first to go)*

### method
- .sales_line() `EXTRACTED`

### rationale_for
- Online order (website / Shopino). Conceptual OnlineOrder. Table remains… `EXTRACTED`

### uses
- [SyncService](SyncService.md) `INFERRED`
- qualifying_online_orders() `INFERRED`
- metrics_for_customers() `INFERRED`
- status_view() `INFERRED`
- home_summary() `INFERRED`
- audit_imported() `INFERRED`
- upsert_order_gateway_payments() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- online_order_value_orders() `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- pos_range_activity() `INFERRED`
- _returns_canceled_counts() `INFERRED`
- [Command](Command.md) `INFERRED`
- recent_sales_payload() `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- _online() `INFERRED`
- test_exchange_refund_shipping_and_discount_do_not_follow_sales_counts() `INFERRED`
- test_sales_filter_options_from_live_data() `INFERRED`
- filtered_online_orders() `INFERRED`
- _online() `INFERRED`
- *…and 33 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*