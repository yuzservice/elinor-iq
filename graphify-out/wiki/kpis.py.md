# kpis.py

> 36 nodes · cohesion 0.12

## Key Concepts

- **kpis.py** (41 connections) — `backend/apps/sales/kpis.py`
- **test_sales_kpis.py** (26 connections) — `backend/tests/test_sales_kpis.py`
- **_bucket_points()** (14 connections) — `backend/apps/sales/kpis.py`
- **compute_overview_kpis()** (12 connections) — `backend/apps/sales/kpis.py`
- **test_overview_kpis_compare_payload()** (10 connections) — `backend/tests/test_sales_kpis.py`
- **_pos_line_total_expr()** (8 connections) — `backend/apps/sales/analysis.py`
- **filtered_online_orders()** (8 connections) — `backend/apps/sales/kpis.py`
- **overview_kpis_payload()** (8 connections) — `backend/apps/sales/kpis.py`
- **_bucket_key()** (8 connections) — `backend/apps/sales/services.py`
- **filtered_pos_sales()** (7 connections) — `backend/apps/sales/kpis.py`
- **pos_refund_items()** (7 connections) — `backend/apps/sales/semantics.py`
- **_ordered_bucket_keys()** (7 connections) — `backend/apps/sales/services.py`
- **test_overview_kpis_respects_channel_and_payment_filters()** (7 connections) — `backend/tests/test_sales_kpis.py`
- **_pct_change()** (6 connections) — `backend/apps/sales/analysis.py`
- **overview_trend_payload()** (6 connections) — `backend/apps/sales/kpis.py`
- **_pos()** (6 connections) — `backend/tests/test_sales_kpis.py`
- **filtered_online_value_orders()** (5 connections) — `backend/apps/sales/kpis.py`
- **_refund_amount()** (5 connections) — `backend/apps/sales/kpis.py`
- **_online_item()** (5 connections) — `backend/tests/test_sales_kpis.py`
- **parse_csv_param()** (4 connections) — `backend/apps/sales/kpis.py`
- **_customer()** (4 connections) — `backend/tests/test_sales_kpis.py`
- **_online()** (4 connections) — `backend/tests/test_sales_kpis.py`
- **_ordered_bucket_keys_extended()** (3 connections) — `backend/apps/sales/analysis.py`
- **_metric_payload()** (3 connections) — `backend/apps/sales/kpis.py`
- **jdatetime** (3 connections)
- *... and 11 more nodes in this community*

## Relationships

- [analysis.py](analysis.py.md) (15 shared connections)
- [PosSale](PosSale.md) (11 shared connections)
- [sales/views.py](sales-views.py.md) (10 shared connections)
- [SalesLine](SalesLine.md) (9 shared connections)
- [intelligence.py](intelligence.py.md) (8 shared connections)
- [Order](Order.md) (8 shared connections)
- [sales/models.py](sales-models.py.md) (6 shared connections)
- [home_metrics.py](home_metrics.py.md) (4 shared connections)
- [Product](Product.md) (4 shared connections)
- [dates.py](dates.py.md) (2 shared connections)
- [OnlinePayment](OnlinePayment.md) (2 shared connections)
- [OrderItem](OrderItem.md) (2 shared connections)

## Source Files

- `backend/apps/sales/analysis.py`
- `backend/apps/sales/kpis.py`
- `backend/apps/sales/semantics.py`
- `backend/apps/sales/services.py`
- `backend/tests/test_sales_kpis.py`

## Audit Trail

- EXTRACTED: 143 (90%)
- INFERRED: 16 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*