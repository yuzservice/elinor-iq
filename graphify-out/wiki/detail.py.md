# detail.py

> 30 nodes · cohesion 0.14

## Key Concepts

- **detail.py** (40 connections) — `backend/apps/customers/detail.py`
- **presentation.py** (18 connections) — `backend/apps/customers/presentation.py`
- **customer_360_payload()** (17 connections) — `backend/apps/customers/detail.py`
- **hydrate_customer_rows()** (11 connections) — `backend/apps/customers/list_query.py`
- **list_payload()** (8 connections) — `backend/apps/customers/presentation.py`
- **metrics.py** (6 connections) — `backend/apps/core/metrics.py`
- **_product_history()** (6 connections) — `backend/apps/customers/detail.py`
- **_purchase_events()** (6 connections) — `backend/apps/customers/detail.py`
- **purchase_history()** (6 connections) — `backend/apps/customers/detail.py`
- **operator_payload()** (6 connections) — `backend/apps/customers/operators.py`
- **customer_status_label()** (6 connections) — `backend/apps/customers/presentation.py`
- **_discounts()** (5 connections) — `backend/apps/customers/detail.py`
- **_hydrate_purchase_items()** (5 connections) — `backend/apps/customers/detail.py`
- **channel_for()** (5 connections) — `backend/apps/customers/purchases.py`
- **_units_purchased()** (4 connections) — `backend/apps/customers/detail.py`
- **is_incomplete()** (4 connections) — `backend/apps/customers/presentation.py`
- **_pos_status()** (3 connections) — `backend/apps/customers/detail.py`
- **_pos_status_label()** (3 connections) — `backend/apps/customers/detail.py`
- **_profile_payload()** (3 connections) — `backend/apps/customers/detail.py`
- **_sales_line_usage()** (3 connections) — `backend/apps/customers/detail.py`
- **gender_label()** (3 connections) — `backend/apps/customers/presentation.py`
- **behavior_for()** (3 connections) — `backend/apps/customers/purchases.py`
- **_add_product_row()** (2 connections) — `backend/apps/customers/detail.py`
- **_item_payload()** (2 connections) — `backend/apps/customers/detail.py`
- **_order_receiver_name()** (2 connections) — `backend/apps/customers/detail.py`
- *... and 5 more nodes in this community*

## Relationships

- [customers/views.py](customers-views.py.md) (9 shared connections)
- [sales/models.py](sales-models.py.md) (7 shared connections)
- [ingest.py](ingest.py.md) (7 shared connections)
- [operators.py](operators.py.md) (7 shared connections)
- [SalesLine](SalesLine.md) (6 shared connections)
- [tiers.py](tiers.py.md) (5 shared connections)
- [list_query.py](list_query.py.md) (5 shared connections)
- [home_metrics.py](home_metrics.py.md) (4 shared connections)
- [OrderItem](OrderItem.md) (4 shared connections)
- [analysis.py](analysis.py.md) (3 shared connections)
- [export.py](export.py.md) (2 shared connections)
- [PosSale](PosSale.md) (1 shared connections)

## Source Files

- `backend/apps/core/metrics.py`
- `backend/apps/customers/detail.py`
- `backend/apps/customers/list_query.py`
- `backend/apps/customers/operators.py`
- `backend/apps/customers/presentation.py`
- `backend/apps/customers/purchases.py`

## Audit Trail

- EXTRACTED: 114 (92%)
- INFERRED: 10 (8%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*