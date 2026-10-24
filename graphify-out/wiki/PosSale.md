# PosSale

> 26 nodes · cohesion 0.17

## Key Concepts

- **PosSale** (75 connections) — `backend/apps/sales/models.py`
- **services.py** (67 connections) — `backend/apps/sales/services.py`
- **semantics.py** (48 connections) — `backend/apps/sales/semantics.py`
- **physical_returns_report()** (13 connections) — `backend/apps/sales/analysis.py`
- **_returns_canceled_counts()** (11 connections) — `backend/apps/sales/services.py`
- **recent_sales_payload()** (10 connections) — `backend/apps/sales/services.py`
- **pos_refund_sales()** (6 connections) — `backend/apps/sales/semantics.py`
- **pos_exchange_replacement_items()** (5 connections) — `backend/apps/sales/semantics.py`
- **_recent_online_event()** (5 connections) — `backend/apps/sales/services.py`
- **online_canceled_orders()** (4 connections) — `backend/apps/sales/semantics.py`
- **online_failed_orders()** (4 connections) — `backend/apps/sales/semantics.py`
- **online_wait_for_payment_orders()** (4 connections) — `backend/apps/sales/semantics.py`
- **pos_cancelled_sales()** (4 connections) — `backend/apps/sales/semantics.py`
- **pos_exchange_sales()** (4 connections) — `backend/apps/sales/semantics.py`
- **pos_status_label()** (4 connections) — `backend/apps/sales/semantics.py`
- **_customer_name()** (4 connections) — `backend/apps/sales/services.py`
- **_recent_pos_event()** (4 connections) — `backend/apps/sales/services.py`
- **online_status_label()** (3 connections) — `backend/apps/sales/semantics.py`
- **pos_recent_status_label()** (3 connections) — `backend/apps/sales/semantics.py`
- **pos_deleted_sales()** (2 connections) — `backend/apps/sales/semantics.py`
- **POS-only returns and exchanges. Online canceled/failed are excluded.** (1 connections) — `backend/apps/sales/analysis.py`
- **Meta** (1 connections) — `backend/apps/sales/models.py`
- **pos_status_key()** (1 connections) — `backend/apps/sales/semantics.py`
- **Central sales semantics for ELINOR IQ. Single source of truth for sales…** (1 connections) — `backend/apps/sales/semantics.py`
- **Sell items delivered as part of an exchange (``both`` header).** (1 connections) — `backend/apps/sales/semantics.py`
- *... and 1 more nodes in this community*

## Relationships

- [analysis.py](analysis.py.md) (31 shared connections)
- [SalesLine](SalesLine.md) (22 shared connections)
- [home_metrics.py](home_metrics.py.md) (13 shared connections)
- [kpis.py](kpis.py.md) (11 shared connections)
- [sales/views.py](sales-views.py.md) (10 shared connections)
- [sales/models.py](sales-models.py.md) (9 shared connections)
- [Order](Order.md) (9 shared connections)
- [intelligence.py](intelligence.py.md) (9 shared connections)
- [list_query.py](list_query.py.md) (8 shared connections)
- [sync.py](sync.py.md) (7 shared connections)
- [test_sales_overview.py](test_sales_overview.py.md) (7 shared connections)
- [test_pos_sync.py](test_pos_sync.py.md) (6 shared connections)

## Source Files

- `backend/apps/sales/analysis.py`
- `backend/apps/sales/models.py`
- `backend/apps/sales/semantics.py`
- `backend/apps/sales/services.py`

## Audit Trail

- EXTRACTED: 180 (78%)
- INFERRED: 51 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*