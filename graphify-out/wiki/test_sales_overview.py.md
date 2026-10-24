# test_sales_overview.py

> 22 nodes · cohesion 0.27

## Key Concepts

- **test_sales_overview.py** (39 connections) — `backend/tests/test_sales_overview.py`
- **_customer()** (12 connections) — `backend/tests/test_sales_overview.py`
- **django_db** (12 connections)
- **sales_line_for_store()** (10 connections) — `backend/apps/sales/semantics.py`
- **_pos()** (9 connections) — `backend/tests/test_sales_overview.py`
- **test_trend_amount_ignores_zero_real_amount()** (8 connections) — `backend/tests/test_sales_overview.py`
- **overview_trend_points()** (7 connections) — `backend/apps/sales/services.py`
- **_online()** (7 connections) — `backend/tests/test_sales_overview.py`
- **_pos_item()** (7 connections) — `backend/tests/test_sales_overview.py`
- **test_sales_line_filter_and_comparison()** (7 connections) — `backend/tests/test_sales_overview.py`
- **test_monthly_trend_tolerates_orphan_pos_items()** (6 connections) — `backend/tests/test_sales_overview.py`
- **test_online_order_value_only_for_online_line()** (6 connections) — `backend/tests/test_sales_overview.py`
- **test_pos_refund_and_cancelled_handling()** (6 connections) — `backend/tests/test_sales_overview.py`
- **test_recent_sales_unified_table()** (6 connections) — `backend/tests/test_sales_overview.py`
- **test_trend_aggregation_daily_weekly_monthly()** (6 connections) — `backend/tests/test_sales_overview.py`
- **test_online_qualifying_rule_excludes_documented_statuses()** (5 connections) — `backend/tests/test_sales_overview.py`
- **_online_item()** (4 connections) — `backend/tests/test_sales_overview.py`
- **test_date_filtering()** (4 connections) — `backend/tests/test_sales_overview.py`
- **test_online_excluded_statuses_are_not_counted_in_overview()** (4 connections) — `backend/tests/test_sales_overview.py`
- **test_parse_sales_line_filter()** (4 connections) — `backend/tests/test_sales_overview.py`
- **test_store_sales_line_mapping()** (4 connections) — `backend/tests/test_sales_overview.py`
- **Backward-compatible alias for tests.** (1 connections) — `backend/apps/sales/services.py`

## Relationships

- [Product](Product.md) (8 shared connections)
- [PosSale](PosSale.md) (7 shared connections)
- [Order](Order.md) (7 shared connections)
- [analysis.py](analysis.py.md) (6 shared connections)
- [sales/models.py](sales-models.py.md) (6 shared connections)
- [SalesLine](SalesLine.md) (4 shared connections)
- [test_sales_analysis.py](test_sales_analysis.py.md) (2 shared connections)
- [kpis.py](kpis.py.md) (2 shared connections)
- [OrderItem](OrderItem.md) (2 shared connections)
- [sales/views.py](sales-views.py.md) (2 shared connections)
- [test_import_core.py](test_import_core.py.md) (1 shared connections)
- [sync.py](sync.py.md) (1 shared connections)

## Source Files

- `backend/apps/sales/semantics.py`
- `backend/apps/sales/services.py`
- `backend/tests/test_sales_overview.py`

## Audit Trail

- EXTRACTED: 95 (86%)
- INFERRED: 16 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*