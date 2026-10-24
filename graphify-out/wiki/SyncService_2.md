# SyncService

> God node · 92 connections · `backend/apps/integrations/elinor/sync.py`

**Community:** [SyncService](SyncService.md)

## Connections by Relation

### calls
- _sync_service() `EXTRACTED`
- .handle() `EXTRACTED`
- _run_pos_range() `EXTRACTED`
- _run_recent_sync() `EXTRACTED`
- make_service() `EXTRACTED`
- .handle() `EXTRACTED`
- .handle() `EXTRACTED`
- .handle() `EXTRACTED`
- .handle() `EXTRACTED`
- .handle() `EXTRACTED`

### contains
- [sync.py](sync.py.md) `EXTRACTED`

### imports
- [system/views.py](system-views.py.md) `EXTRACTED`
- [test_pos_sync.py](test_pos_sync.py.md) `EXTRACTED`
- [conftest.py](conftest.py.md) `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- test_gateway_payments.py `EXTRACTED`
- test_sync.py `EXTRACTED`
- sync_elinor_bootstrap.py `EXTRACTED`
- sync_elinor_recent.py `EXTRACTED`
- sync_elinor_details.py `EXTRACTED`
- sync_elinor_pos.py `EXTRACTED`
- test_customer_sync.py `EXTRACTED`
- sync_elinor_hourly.py `EXTRACTED`
- sync_elinor_customers.py `EXTRACTED`

### method
- ._sync_pos_sales() `EXTRACTED`
- ._sync_order_details() `EXTRACTED`
- .execute_hourly() `EXTRACTED`
- ._sync_pos_details() `EXTRACTED`
- ._finish() `EXTRACTED`
- .execute() `EXTRACTED`
- .execute_customers() `EXTRACTED`
- .execute_pos() `EXTRACTED`
- ._sync_orders() `EXTRACTED`
- .execute_details() `EXTRACTED`
- ._persist_progress() `EXTRACTED`
- ._reconcile_coverage() `EXTRACTED`
- ._hydrate_product() `EXTRACTED`
- ._sync_online_days() `EXTRACTED`
- ._ensure_not_running() `EXTRACTED`
- ._active_pos_branches() `EXTRACTED`
- ._upsert_light_order() `EXTRACTED`
- ._upsert_pos_header() `EXTRACTED`
- ._upsert_pos_item() `EXTRACTED`
- ._touch_heartbeat() `EXTRACTED`
- *…and 20 more `method` connection(s) not listed (lowest-degree first to go)*

### uses
- [Order](Order.md) `INFERRED`
- [Customer](Customer.md) `INFERRED`
- [PosSale](PosSale.md) `INFERRED`
- [OrderItem](OrderItem.md) `INFERRED`
- [Product](Product.md) `INFERRED`
- [PosSaleItem](PosSaleItem.md) `INFERRED`
- [SyncRun](SyncRun.md) `INFERRED`
- [Variant](Variant.md) `INFERRED`
- [ElinorClient](ElinorClient.md) `INFERRED`
- PosDaySync `INFERRED`
- Store `INFERRED`
- ElinorApiError `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_failed_order_detail_is_not_marked_synced() `INFERRED`
- test_pos_sync_upserts_sale_and_items() `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- test_pos_cap_resumes_on_the_next_page_instead_of_page_one() `INFERRED`
- *…and 8 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*