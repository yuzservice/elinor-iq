# list_query.py

> 22 nodes · cohesion 0.20

## Key Concepts

- **list_query.py** (48 connections) — `backend/apps/customers/list_query.py`
- **customer_list_queryset()** (26 connections) — `backend/apps/customers/list_query.py`
- **_apply_sort()** (7 connections) — `backend/apps/customers/list_query.py`
- **tier_lifetime_amount_expression()** (7 connections) — `backend/apps/customers/tiers.py`
- **tier_first_purchase_expression()** (6 connections) — `backend/apps/customers/tiers.py`
- **tier_last_purchase_expression()** (6 connections) — `backend/apps/customers/tiers.py`
- **tier_purchase_count_expression()** (6 connections) — `backend/apps/customers/tiers.py`
- **qualifying_order_exists()** (5 connections) — `backend/apps/customers/purchases.py`
- **qualifying_pos_exists()** (5 connections) — `backend/apps/customers/purchases.py`
- **_parse_bound()** (5 connections) — `backend/apps/sales/services.py`
- **_apply_category_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_apply_city_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_apply_discount_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_apply_order_behavior_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_apply_payment_method_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_apply_size_filter()** (4 connections) — `backend/apps/customers/list_query.py`
- **_operator_rank()** (3 connections) — `backend/apps/customers/list_query.py`
- **_apply_profile_state_filter()** (2 connections) — `backend/apps/customers/list_query.py`
- **_apply_search()** (2 connections) — `backend/apps/customers/list_query.py`
- **_as_int()** (2 connections) — `backend/apps/customers/list_query.py`
- **_buyer_analytics_filter()** (2 connections) — `backend/apps/customers/list_query.py`
- **parse_sales_lines_filter()** (2 connections) — `backend/apps/customers/list_query.py`

## Relationships

- [Order](Order.md) (9 shared connections)
- [tiers.py](tiers.py.md) (8 shared connections)
- [PosSale](PosSale.md) (8 shared connections)
- [sales/models.py](sales-models.py.md) (6 shared connections)
- [operators.py](operators.py.md) (6 shared connections)
- [detail.py](detail.py.md) (5 shared connections)
- [analysis.py](analysis.py.md) (5 shared connections)
- [customers/views.py](customers-views.py.md) (5 shared connections)
- [OrderItem](OrderItem.md) (3 shared connections)
- [SalesLine](SalesLine.md) (3 shared connections)
- [OnlinePayment](OnlinePayment.md) (2 shared connections)
- [test_import_core.py](test_import_core.py.md) (2 shared connections)

## Source Files

- `backend/apps/customers/list_query.py`
- `backend/apps/customers/purchases.py`
- `backend/apps/customers/tiers.py`
- `backend/apps/sales/services.py`

## Audit Trail

- EXTRACTED: 91 (82%)
- INFERRED: 20 (18%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*