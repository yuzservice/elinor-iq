# parse_datetime

> 19 nodes · cohesion 0.22

## Key Concepts

- **parse_datetime()** (21 connections) — `backend/apps/integrations/elinor/parsers.py`
- **._sync_order_details()** (18 connections) — `backend/apps/integrations/elinor/sync.py`
- **as_int()** (17 connections) — `backend/apps/integrations/elinor/parsers.py`
- **._sync_pos_details()** (14 connections) — `backend/apps/integrations/elinor/sync.py`
- **extract_list()** (10 connections) — `backend/apps/integrations/elinor/parsers.py`
- **._hydrate_product()** (8 connections) — `backend/apps/integrations/elinor/sync.py`
- **as_bool()** (6 connections) — `backend/apps/integrations/elinor/parsers.py`
- **._upsert_light_order()** (6 connections) — `backend/apps/integrations/elinor/sync.py`
- **._upsert_pos_header()** (6 connections) — `backend/apps/integrations/elinor/sync.py`
- **._upsert_pos_item()** (6 connections) — `backend/apps/integrations/elinor/sync.py`
- **.get_order_invoices()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **add_row()** (4 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **._customer_from_row()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **._note_tier_customer()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **._upsert_item()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **_parse_date()** (3 connections) — `backend/apps/customers/ingest.py`
- **_nullable_amount()** (3 connections) — `backend/apps/integrations/elinor/sync.py`
- **._save_variant()** (3 connections) — `backend/apps/integrations/elinor/sync.py`
- **test_parse_elinor_datetime()** (2 connections) — `backend/tests/test_elinor_client.py`

## Relationships

- [SyncService](SyncService.md) (22 shared connections)
- [ElinorClient](ElinorClient.md) (13 shared connections)
- [ingest.py](ingest.py.md) (11 shared connections)
- [OnlinePayment](OnlinePayment.md) (10 shared connections)
- [sync.py](sync.py.md) (6 shared connections)
- [OrderItem](OrderItem.md) (2 shared connections)
- [runner.py](runner.py.md) (1 shared connections)
- [conftest.py](conftest.py.md) (1 shared connections)
- [test_customer_tiers.py](test_customer_tiers.py.md) (1 shared connections)
- [system/views.py](system-views.py.md) (1 shared connections)

## Source Files

- `backend/apps/customers/ingest.py`
- `backend/apps/integrations/elinor/client.py`
- `backend/apps/integrations/elinor/gateway_payments.py`
- `backend/apps/integrations/elinor/parsers.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/tests/test_elinor_client.py`

## Audit Trail

- EXTRACTED: 99 (93%)
- INFERRED: 7 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*