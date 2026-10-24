# OrderItem

> 17 nodes · cohesion 0.17

## Key Concepts

- **OrderItem** (54 connections) — `backend/apps/sales/models.py`
- **test_details_sync.py** (21 connections) — `backend/tests/test_details_sync.py`
- **ElinorApiError** (13 connections) — `backend/apps/integrations/elinor/client.py`
- **test_details_sync_is_limited_resumable_and_idempotent()** (12 connections) — `backend/tests/test_details_sync.py`
- **Command** (10 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- **test_failed_order_detail_is_not_marked_synced()** (10 connections) — `backend/tests/test_details_sync.py`
- **_order()** (4 connections) — `backend/tests/test_details_sync.py`
- **django_db** (2 connections)
- **fail()** (2 connections) — `backend/tests/test_details_sync.py`
- **.__init__()** (1 connections) — `backend/apps/integrations/elinor/client.py`
- **.add_arguments()** (1 connections) — `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- **BaseCommand** (1 connections)
- **.display_title()** (1 connections) — `backend/apps/sales/models.py`
- **Meta** (1 connections) — `backend/apps/sales/models.py`
- **Online order line. Conceptual OnlineOrderItem. Table remains `order_items`.** (1 connections) — `backend/apps/sales/models.py`
- **get_order()** (1 connections) — `backend/tests/test_details_sync.py`
- **Exception** (1 connections)

## Relationships

- [Product](Product.md) (13 shared connections)
- [sync.py](sync.py.md) (12 shared connections)
- [Order](Order.md) (10 shared connections)
- [SyncService](SyncService.md) (9 shared connections)
- [sales/models.py](sales-models.py.md) (7 shared connections)
- [test_import_core.py](test_import_core.py.md) (5 shared connections)
- [ElinorClient](ElinorClient.md) (4 shared connections)
- [detail.py](detail.py.md) (4 shared connections)
- [list_query.py](list_query.py.md) (3 shared connections)
- [conftest.py](conftest.py.md) (3 shared connections)
- [parse_datetime](parse_datetime.md) (2 shared connections)
- [home_metrics.py](home_metrics.py.md) (2 shared connections)

## Source Files

- `backend/apps/integrations/elinor/client.py`
- `backend/apps/integrations/elinor/management/commands/sync_elinor_details.py`
- `backend/apps/sales/models.py`
- `backend/tests/test_details_sync.py`

## Audit Trail

- EXTRACTED: 67 (59%)
- INFERRED: 46 (41%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*