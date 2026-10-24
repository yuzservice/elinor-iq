# SalesLine

> 28 nodes · cohesion 0.13

## Key Concepts

- **SalesLine** (82 connections) — `backend/apps/sales/models.py`
- **diagnose_pos_sync.py** (21 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_pos_sync.py`
- **coverage_payload()** (19 connections) — `backend/apps/core/coverage.py`
- **coverage.py** (18 connections) — `backend/apps/core/coverage.py`
- **django_db_models** (17 connections)
- **OnlineInvoice** (13 connections) — `backend/apps/sales/models.py`
- **test_pos_sync_coverage.py** (13 connections) — `backend/tests/test_pos_sync_coverage.py`
- **test_sales_filter_options.py** (13 connections) — `backend/tests/test_sales_filter_options.py`
- **Command** (9 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_pos_sync.py`
- **test_sales_filter_options_from_live_data()** (9 connections) — `backend/tests/test_sales_filter_options.py`
- **zoneinfo** (9 connections)
- **filter_options.py** (7 connections) — `backend/apps/sales/filter_options.py`
- **pos_sync_status()** (6 connections) — `backend/apps/core/coverage.py`
- **test_coverage_ok_for_recent_pos_sales()** (6 connections) — `backend/tests/test_pos_sync_coverage.py`
- **test_coverage_warns_when_pos_sync_is_stale()** (6 connections) — `backend/tests/test_pos_sync_coverage.py`
- **.handle()** (5 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_pos_sync.py`
- **sales_filter_options_payload()** (5 connections) — `backend/apps/sales/filter_options.py`
- **test_customer_campaigns_api_and_redemptions()** (5 connections) — `backend/tests/test_customer_campaigns.py`
- **_pos_wallet_sale()** (4 connections) — `backend/tests/test_customer_campaigns.py`
- **django_db** (3 connections)
- **test_coverage_ok_without_pos_sales()** (3 connections) — `backend/tests/test_pos_sync_coverage.py`
- **Coverage notices for incomplete live API windows.** (1 connections) — `backend/apps/core/coverage.py`
- **BaseCommand** (1 connections)
- **Discover sales filter options from live database facts.** (1 connections) — `backend/apps/sales/filter_options.py`
- **Meta** (1 connections) — `backend/apps/sales/models.py`
- *... and 3 more nodes in this community*

## Relationships

- [PosSale](PosSale.md) (22 shared connections)
- [sales/models.py](sales-models.py.md) (17 shared connections)
- [sync.py](sync.py.md) (14 shared connections)
- [Order](Order.md) (13 shared connections)
- [analysis.py](analysis.py.md) (13 shared connections)
- [intelligence.py](intelligence.py.md) (11 shared connections)
- [test_pos_sync.py](test_pos_sync.py.md) (11 shared connections)
- [home_metrics.py](home_metrics.py.md) (9 shared connections)
- [OnlinePayment](OnlinePayment.md) (9 shared connections)
- [kpis.py](kpis.py.md) (9 shared connections)
- [test_import_core.py](test_import_core.py.md) (8 shared connections)
- [detail.py](detail.py.md) (6 shared connections)

## Source Files

- `backend/apps/core/coverage.py`
- `backend/apps/integrations/elinor/management/commands/diagnose_pos_sync.py`
- `backend/apps/sales/filter_options.py`
- `backend/apps/sales/models.py`
- `backend/tests/test_customer_campaigns.py`
- `backend/tests/test_pos_sync_coverage.py`
- `backend/tests/test_sales_filter_options.py`

## Audit Trail

- EXTRACTED: 159 (69%)
- INFERRED: 73 (31%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*