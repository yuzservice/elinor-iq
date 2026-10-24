# SyncService

> 43 nodes · cohesion 0.13

## Key Concepts

- **SyncService** (92 connections) — `backend/apps/integrations/elinor/sync.py`
- **._sync_pos_sales()** (20 connections) — `backend/apps/integrations/elinor/sync.py`
- **.execute_hourly()** (16 connections) — `backend/apps/integrations/elinor/sync.py`
- **.execute()** (12 connections) — `backend/apps/integrations/elinor/sync.py`
- **._finish()** (12 connections) — `backend/apps/integrations/elinor/sync.py`
- **.execute_customers()** (11 connections) — `backend/apps/integrations/elinor/sync.py`
- **.execute_pos()** (11 connections) — `backend/apps/integrations/elinor/sync.py`
- **._sync_orders()** (11 connections) — `backend/apps/integrations/elinor/sync.py`
- **.execute_details()** (10 connections) — `backend/apps/integrations/elinor/sync.py`
- **_cursor()** (9 connections) — `backend/apps/integrations/elinor/sync.py`
- **._persist_progress()** (9 connections) — `backend/apps/integrations/elinor/sync.py`
- **._reconcile_coverage()** (9 connections) — `backend/apps/integrations/elinor/sync.py`
- **._sync_online_days()** (8 connections) — `backend/apps/integrations/elinor/sync.py`
- **Command** (7 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_hourly.py`
- **._active_pos_branches()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **._ensure_not_running()** (7 connections) — `backend/apps/integrations/elinor/sync.py`
- **._branch_day_is_closed()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **._note_pos_day()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **._pos_day_is_open()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **._pos_day_start_page()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **._touch_heartbeat()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **.handle()** (4 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
- **recent_window()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **._note_branches()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **._pause_pos_day()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- *... and 18 more nodes in this community*

## Relationships

- [sync.py](sync.py.md) (24 shared connections)
- [parse_datetime](parse_datetime.md) (22 shared connections)
- [test_pos_sync.py](test_pos_sync.py.md) (17 shared connections)
- [ElinorClient](ElinorClient.md) (10 shared connections)
- [OrderItem](OrderItem.md) (9 shared connections)
- [Product](Product.md) (8 shared connections)
- [conftest.py](conftest.py.md) (5 shared connections)
- [Order](Order.md) (4 shared connections)
- [system/views.py](system-views.py.md) (3 shared connections)
- [ingest.py](ingest.py.md) (3 shared connections)
- [PosSale](PosSale.md) (2 shared connections)
- [OnlinePayment](OnlinePayment.md) (2 shared connections)

## Source Files

- `backend/apps/integrations/elinor/management/commands/sync_elinor_bootstrap.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_customers.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_hourly.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_recent.py`
- `backend/apps/integrations/elinor/sync.py`

## Audit Trail

- EXTRACTED: 172 (76%)
- INFERRED: 54 (24%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*