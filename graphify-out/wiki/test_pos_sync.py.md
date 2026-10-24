# test_pos_sync.py

> 56 nodes · cohesion 0.08

## Key Concepts

- **test_pos_sync.py** (48 connections) — `backend/tests/test_pos_sync.py`
- **PosDaySync** (24 connections) — `backend/apps/integrations/elinor/models.py`
- **django_db** (21 connections)
- **Store** (15 connections) — `backend/apps/sales/models.py`
- **pos_range_activity()** (11 connections) — `backend/apps/integrations/elinor/sync.py`
- **_sync_service()** (10 connections) — `backend/tests/test_pos_sync.py`
- **test_pos_sync_upserts_sale_and_items()** (10 connections) — `backend/tests/test_pos_sync.py`
- **repair_mismatched_pos_day_syncs()** (9 connections) — `backend/apps/integrations/elinor/sync.py`
- **test_pos_cap_resumes_on_the_next_page_instead_of_page_one()** (9 connections) — `backend/tests/test_pos_sync.py`
- **hourly_sync_days()** (8 connections) — `backend/apps/integrations/elinor/sync.py`
- **test_pos_sync_fetches_date_range_not_single_day()** (8 connections) — `backend/tests/test_pos_sync.py`
- **test_repair_mismatched_pos_day_syncs()** (8 connections) — `backend/tests/test_pos_sync.py`
- **branch_day_confirmed()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **branch_stored_count()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **pos_week_activity()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **pos_window()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **_mini_order()** (7 connections) — `backend/tests/test_pos_sync.py`
- **test_pos_window_restarts_from_sql_cutoff_not_latest_sale()** (7 connections) — `backend/tests/test_pos_sync.py`
- **_confirm()** (6 connections) — `backend/tests/test_pos_sync.py`
- **test_hourly_sync_fetches_pos_before_online_orders()** (6 connections) — `backend/tests/test_pos_sync.py`
- **earliest_unconfirmed_day()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **test_partial_day_in_the_past_month_stays_on_the_automatic_list()** (5 connections) — `backend/tests/test_pos_sync.py`
- **test_resumed_pos_sync_accumulates_seen_counts()** (5 connections) — `backend/tests/test_pos_sync.py`
- **_day_needs_repair()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **resume_explicit_pos_start()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- *... and 31 more nodes in this community*

## Relationships

- [sync.py](sync.py.md) (27 shared connections)
- [SyncService](SyncService.md) (17 shared connections)
- [SalesLine](SalesLine.md) (11 shared connections)
- [Order](Order.md) (6 shared connections)
- [PosSale](PosSale.md) (6 shared connections)
- [sales/models.py](sales-models.py.md) (6 shared connections)
- [system/views.py](system-views.py.md) (4 shared connections)
- [test_import_core.py](test_import_core.py.md) (1 shared connections)

## Source Files

- `backend/apps/integrations/elinor/management/commands/repair_pos_sync.py`
- `backend/apps/integrations/elinor/models.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/apps/sales/models.py`
- `backend/tests/test_pos_sync.py`

## Audit Trail

- EXTRACTED: 149 (72%)
- INFERRED: 57 (28%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*