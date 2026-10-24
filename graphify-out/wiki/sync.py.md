# sync.py

> 31 nodes · cohesion 0.14

## Key Concepts

- **sync.py** (74 connections) — `backend/apps/integrations/elinor/sync.py`
- **SyncRun** (48 connections) — `backend/apps/integrations/elinor/models.py`
- **datetime** (35 connections)
- **elinor/models.py** (27 connections) — `backend/apps/integrations/elinor/models.py`
- **SyncCursor** (20 connections) — `backend/apps/integrations/elinor/models.py`
- **django_core_management_base** (15 connections)
- **sync_elinor_details.py** (12 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- **sync_elinor_pos.py** (12 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
- **test_customer_sync.py** (11 connections) — `backend/tests/test_customer_sync.py`
- **clear_stuck_sync_runs()** (10 connections) — `backend/apps/integrations/elinor/sync.py`
- **sync_elinor_hourly.py** (9 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_hourly.py`
- **clear_stuck_sync.py** (8 connections) — `backend/apps/integrations/elinor/management/commands/clear_stuck_sync.py`
- **sync_elinor_customers.py** (8 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_customers.py`
- **Command** (8 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
- **test_customer_sync_paginated_resumable_and_idempotent()** (8 connections) — `backend/tests/test_customer_sync.py`
- **test_customer_sync_resumes_from_saved_page()** (8 connections) — `backend/tests/test_customer_sync.py`
- **Command** (6 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_customers.py`
- **elinor/admin.py** (5 connections) — `backend/apps/integrations/elinor/admin.py`
- **Command** (5 connections) — `backend/apps/integrations/elinor/management/commands/clear_stuck_sync.py`
- **repair_pos_sync.py** (4 connections) — `backend/apps/integrations/elinor/management/commands/repair_pos_sync.py`
- **.handle()** (2 connections) — `backend/apps/integrations/elinor/management/commands/clear_stuck_sync.py`
- **_page()** (2 connections) — `backend/tests/test_customer_sync.py`
- **django_db** (2 connections)
- **.add_arguments()** (1 connections) — `backend/apps/integrations/elinor/management/commands/clear_stuck_sync.py`
- **BaseCommand** (1 connections)
- *... and 6 more nodes in this community*

## Relationships

- [test_pos_sync.py](test_pos_sync.py.md) (27 shared connections)
- [SyncService](SyncService.md) (24 shared connections)
- [Order](Order.md) (17 shared connections)
- [Product](Product.md) (17 shared connections)
- [system/views.py](system-views.py.md) (15 shared connections)
- [sales/models.py](sales-models.py.md) (14 shared connections)
- [SalesLine](SalesLine.md) (14 shared connections)
- [OrderItem](OrderItem.md) (12 shared connections)
- [conftest.py](conftest.py.md) (11 shared connections)
- [test_customer_tiers.py](test_customer_tiers.py.md) (9 shared connections)
- [OnlinePayment](OnlinePayment.md) (9 shared connections)
- [runner.py](runner.py.md) (7 shared connections)

## Source Files

- `backend/apps/integrations/elinor/admin.py`
- `backend/apps/integrations/elinor/management/commands/clear_stuck_sync.py`
- `backend/apps/integrations/elinor/management/commands/repair_pos_sync.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_customers.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_hourly.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_pos.py`
- `backend/apps/integrations/elinor/models.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/tests/test_customer_sync.py`

## Audit Trail

- EXTRACTED: 230 (82%)
- INFERRED: 50 (18%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*