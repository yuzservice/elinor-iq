# ElinorClient

> 33 nodes · cohesion 0.15

## Key Concepts

- **ElinorClient** (29 connections) — `backend/apps/integrations/elinor/client.py`
- **client.py** (21 connections) — `backend/apps/integrations/elinor/client.py`
- **._request()** (17 connections) — `backend/apps/integrations/elinor/client.py`
- **unwrap_data()** (16 connections) — `backend/apps/integrations/elinor/parsers.py`
- **parsers.py** (15 connections) — `backend/apps/integrations/elinor/parsers.py`
- **.authenticate()** (10 connections) — `backend/apps/integrations/elinor/client.py`
- **get_campaigns_summary()** (9 connections) — `backend/apps/customers/campaigns.py`
- **extract_paginator()** (9 connections) — `backend/apps/integrations/elinor/parsers.py`
- **test_elinor_client.py** (9 connections) — `backend/tests/test_elinor_client.py`
- **extract_object()** (8 connections) — `backend/apps/integrations/elinor/parsers.py`
- **fetch_live_actions()** (6 connections) — `backend/apps/customers/campaigns.py`
- **.get_customer()** (6 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_action()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_actions()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_customers()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_mini_orders()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_order()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_orders_light()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_product()** (5 connections) — `backend/apps/integrations/elinor/client.py`
- **.get_mini_order()** (4 connections) — `backend/apps/integrations/elinor/client.py`
- **test_throttle_detection()** (4 connections) — `backend/tests/test_elinor_client.py`
- **_parse_date()** (3 connections) — `backend/apps/customers/campaigns.py`
- **._is_throttle()** (3 connections) — `backend/apps/integrations/elinor/client.py`
- **_safe_json()** (3 connections) — `backend/apps/integrations/elinor/client.py`
- **test_unwrap_and_paginator_orders_light()** (3 connections) — `backend/tests/test_elinor_client.py`
- *... and 8 more nodes in this community*

## Relationships

- [parse_datetime](parse_datetime.md) (13 shared connections)
- [SyncService](SyncService.md) (10 shared connections)
- [sales/models.py](sales-models.py.md) (5 shared connections)
- [sync.py](sync.py.md) (5 shared connections)
- [conftest.py](conftest.py.md) (5 shared connections)
- [ingest.py](ingest.py.md) (4 shared connections)
- [test_platform_access.py](test_platform_access.py.md) (4 shared connections)
- [OrderItem](OrderItem.md) (4 shared connections)
- [SalesLine](SalesLine.md) (4 shared connections)
- [system/views.py](system-views.py.md) (3 shared connections)
- [customers/views.py](customers-views.py.md) (2 shared connections)
- [PosSale](PosSale.md) (1 shared connections)

## Source Files

- `backend/apps/customers/campaigns.py`
- `backend/apps/integrations/elinor/client.py`
- `backend/apps/integrations/elinor/parsers.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/tests/test_elinor_client.py`

## Audit Trail

- EXTRACTED: 123 (87%)
- INFERRED: 19 (13%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*