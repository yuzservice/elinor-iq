# analysis.py

> 35 nodes · cohesion 0.16

## Key Concepts

- **analysis.py** (69 connections) — `backend/apps/sales/analysis.py`
- **qualifying_pos_sales()** (21 connections) — `backend/apps/sales/semantics.py`
- **core_metrics()** (19 connections) — `backend/apps/sales/analysis.py`
- **qualifying_online_orders()** (19 connections) — `backend/apps/sales/semantics.py`
- **filter_by_sales_line_pos()** (17 connections) — `backend/apps/sales/semantics.py`
- **purchases.py** (15 connections) — `backend/apps/customers/purchases.py`
- **filter_by_sales_line_online()** (15 connections) — `backend/apps/sales/semantics.py`
- **trend_points()** (14 connections) — `backend/apps/sales/analysis.py`
- **overview_payload()** (13 connections) — `backend/apps/sales/services.py`
- **_all_line_metrics()** (12 connections) — `backend/apps/sales/analysis.py`
- **product_sales_report()** (12 connections) — `backend/apps/sales/analysis.py`
- **operator_customer_ids()** (11 connections) — `backend/apps/customers/operators.py`
- **sales_line_comparison()** (9 connections) — `backend/apps/sales/analysis.py`
- **_accumulate_daily_amounts()** (8 connections) — `backend/apps/sales/analysis.py`
- **exclude_operator_sales()** (7 connections) — `backend/apps/customers/operators.py`
- **_accumulate_daily_purchases()** (7 connections) — `backend/apps/sales/analysis.py`
- **_accumulate_weekday_purchases()** (7 connections) — `backend/apps/sales/analysis.py`
- **django_db_models_functions** (7 connections)
- **_accumulate_hourly_purchases()** (6 connections) — `backend/apps/sales/analysis.py`
- **_merge_unique_customer_counts()** (6 connections) — `backend/apps/sales/analysis.py`
- **branch_insights()** (5 connections) — `backend/apps/sales/analysis.py`
- **_empty_trend_bucket()** (5 connections) — `backend/apps/sales/analysis.py`
- **_new_repeat_counts_online()** (5 connections) — `backend/apps/sales/analysis.py`
- **_new_repeat_counts_pos()** (5 connections) — `backend/apps/sales/analysis.py`
- **_distinct_customer_count()** (4 connections) — `backend/apps/sales/analysis.py`
- *... and 10 more nodes in this community*

## Relationships

- [PosSale](PosSale.md) (31 shared connections)
- [intelligence.py](intelligence.py.md) (23 shared connections)
- [home_metrics.py](home_metrics.py.md) (15 shared connections)
- [kpis.py](kpis.py.md) (15 shared connections)
- [SalesLine](SalesLine.md) (13 shared connections)
- [Order](Order.md) (8 shared connections)
- [test_sales_analysis.py](test_sales_analysis.py.md) (7 shared connections)
- [sales/views.py](sales-views.py.md) (6 shared connections)
- [test_sales_overview.py](test_sales_overview.py.md) (6 shared connections)
- [list_query.py](list_query.py.md) (5 shared connections)
- [operators.py](operators.py.md) (4 shared connections)
- [sales/models.py](sales-models.py.md) (4 shared connections)

## Source Files

- `backend/apps/customers/operators.py`
- `backend/apps/customers/purchases.py`
- `backend/apps/sales/analysis.py`
- `backend/apps/sales/semantics.py`
- `backend/apps/sales/services.py`

## Audit Trail

- EXTRACTED: 231 (94%)
- INFERRED: 14 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*