# Order

> 29 nodes · cohesion 0.14

## Key Concepts

- **Order** (92 connections) — `backend/apps/sales/models.py`
- **Customer** (89 connections) — `backend/apps/customers/models.py`
- **django_utils** (38 connections)
- **test_operator_accounts.py** (18 connections) — `backend/tests/test_operator_accounts.py`
- **refresh_stored_tiers()** (16 connections) — `backend/apps/customers/tiers.py`
- **test_products_and_coverage.py** (13 connections) — `backend/tests/test_products_and_coverage.py`
- **test_customer_campaigns.py** (11 connections) — `backend/tests/test_customer_campaigns.py`
- **test_api.py** (9 connections) — `backend/tests/test_api.py`
- **test_desk_account_stays_in_the_list_without_a_tier()** (7 connections) — `backend/tests/test_operator_accounts.py`
- **test_desk_orders_stay_in_sales_and_show_the_receiver()** (7 connections) — `backend/tests/test_operator_accounts.py`
- **test_products_api_is_sales_focused_without_inventory()** (7 connections) — `backend/tests/test_products_and_coverage.py`
- **backfill_elinor_gateway_payments.py** (6 connections) — `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- **test_customer_list_is_paginated()** (4 connections) — `backend/tests/test_api.py`
- **test_home_and_sales_use_date_range()** (4 connections) — `backend/tests/test_api.py`
- **_buyer()** (4 connections) — `backend/tests/test_operator_accounts.py`
- **_desk()** (4 connections) — `backend/tests/test_operator_accounts.py`
- **_order()** (4 connections) — `backend/tests/test_operator_accounts.py`
- **_customer()** (3 connections) — `backend/tests/test_customer_campaigns.py`
- **test_system_status_includes_coverage_and_purchasing_split()** (3 connections) — `backend/tests/test_products_and_coverage.py`
- **django_db** (2 connections)
- **django_db** (2 connections)
- **django_db** (2 connections)
- **.full_name()** (1 connections) — `backend/apps/customers/models.py`
- **.is_purchasing()** (1 connections) — `backend/apps/customers/models.py`
- **Meta** (1 connections) — `backend/apps/customers/models.py`
- *... and 4 more nodes in this community*

## Relationships

- [sales/models.py](sales-models.py.md) (20 shared connections)
- [sync.py](sync.py.md) (17 shared connections)
- [Product](Product.md) (15 shared connections)
- [test_customer_tiers.py](test_customer_tiers.py.md) (15 shared connections)
- [OnlinePayment](OnlinePayment.md) (15 shared connections)
- [test_import_core.py](test_import_core.py.md) (14 shared connections)
- [SalesLine](SalesLine.md) (13 shared connections)
- [tiers.py](tiers.py.md) (12 shared connections)
- [ingest.py](ingest.py.md) (11 shared connections)
- [OrderItem](OrderItem.md) (10 shared connections)
- [list_query.py](list_query.py.md) (9 shared connections)
- [PosSale](PosSale.md) (9 shared connections)

## Source Files

- `backend/apps/customers/models.py`
- `backend/apps/customers/tiers.py`
- `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- `backend/apps/sales/models.py`
- `backend/tests/test_api.py`
- `backend/tests/test_customer_campaigns.py`
- `backend/tests/test_operator_accounts.py`
- `backend/tests/test_products_and_coverage.py`

## Audit Trail

- EXTRACTED: 191 (64%)
- INFERRED: 106 (36%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*