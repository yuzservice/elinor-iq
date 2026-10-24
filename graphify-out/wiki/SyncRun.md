# SyncRun

> God node · 48 connections · `backend/apps/integrations/elinor/models.py`

**Community:** [sync.py](sync.py.md)

## Connections by Relation

### contains
- elinor/models.py `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- services.py `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [test_pos_sync.py](test_pos_sync.py.md) `EXTRACTED`
- [conftest.py](conftest.py.md) `EXTRACTED`
- diagnose_pos_sync.py `EXTRACTED`
- test_details_sync.py `EXTRACTED`
- test_gateway_payments.py `EXTRACTED`
- test_sync.py `EXTRACTED`
- sync_elinor_bootstrap.py `EXTRACTED`
- sync_elinor_recent.py `EXTRACTED`
- sync_elinor_details.py `EXTRACTED`
- sync_elinor_pos.py `EXTRACTED`
- test_customer_sync.py `EXTRACTED`
- sync_elinor_hourly.py `EXTRACTED`
- clear_stuck_sync.py `EXTRACTED`
- sync_elinor_customers.py `EXTRACTED`
- elinor/admin.py `EXTRACTED`

### uses
- [SyncService](SyncService.md) `INFERRED`
- status_view() `INFERRED`
- test_details_sync_is_limited_resumable_and_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- clear_stuck_sync_runs() `INFERRED`
- test_failed_order_detail_is_not_marked_synced() `INFERRED`
- _sync_service() `INFERRED`
- test_pos_sync_upserts_sale_and_items() `INFERRED`
- test_bootstrap_upsert_is_idempotent() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- test_pos_cap_resumes_on_the_next_page_instead_of_page_one() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_customer_sync_paginated_resumable_and_idempotent() `INFERRED`
- test_customer_sync_resumes_from_saved_page() `INFERRED`
- test_pos_sync_fetches_date_range_not_single_day() `INFERRED`
- [Command](Command.md) `INFERRED`
- default_window() `INFERRED`
- trigger_sync() `INFERRED`
- *…and 8 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*