# test_customer_tiers.py

> 38 nodes · cohesion 0.12

## Key Concepts

- **test_customer_tiers.py** (34 connections) — `backend/tests/test_customer_tiers.py`
- **tier_refresh.py** (20 connections) — `backend/apps/customers/tier_refresh.py`
- **refresh_due_tiers()** (11 connections) — `backend/apps/customers/tier_refresh.py`
- **_online()** (9 connections) — `backend/tests/test_customer_tiers.py`
- **test_exchange_refund_shipping_and_discount_do_not_follow_sales_counts()** (9 connections) — `backend/tests/test_customer_tiers.py`
- **_customer()** (8 connections) — `backend/tests/test_customer_tiers.py`
- **refresh_customer_tiers.py** (7 connections) — `backend/apps/customers/management/commands/refresh_customer_tiers.py`
- **start_full_tier_refresh()** (7 connections) — `backend/apps/customers/tier_refresh.py`
- **tier_code_for()** (7 connections) — `backend/apps/customers/tiers.py`
- **test_negative_lifetime_amount_is_not_clamped()** (7 connections) — `backend/tests/test_customer_tiers.py`
- **test_no_purchase_is_null_and_each_customer_has_one_tier()** (7 connections) — `backend/tests/test_customer_tiers.py`
- **test_sql_tier_matches_service_on_exact_day_boundaries()** (7 connections) — `backend/tests/test_customer_tiers.py`
- **tier_refresh_status()** (6 connections) — `backend/apps/customers/tier_refresh.py`
- **filter_customers_by_tier()** (6 connections) — `backend/apps/customers/tiers.py`
- **_metrics()** (6 connections) — `backend/tests/test_customer_tiers.py`
- **_pos()** (6 connections) — `backend/tests/test_customer_tiers.py`
- **django_db** (6 connections)
- **_claim()** (5 connections) — `backend/apps/customers/tier_refresh.py`
- **_finish()** (5 connections) — `backend/apps/customers/tier_refresh.py`
- **_run_full_refresh()** (5 connections) — `backend/apps/customers/tier_refresh.py`
- **test_daily_tier_refresh_runs_once_per_day()** (5 connections) — `backend/tests/test_customer_tiers.py`
- **test_stored_tier_is_written_for_touched_customers_only()** (5 connections) — `backend/tests/test_customer_tiers.py`
- **Command** (4 connections) — `backend/apps/customers/management/commands/refresh_customer_tiers.py`
- **.handle()** (4 connections) — `backend/apps/customers/management/commands/refresh_customer_tiers.py`
- **_is_running()** (4 connections) — `backend/apps/customers/tier_refresh.py`
- *... and 13 more nodes in this community*

## Relationships

- [Order](Order.md) (15 shared connections)
- [tiers.py](tiers.py.md) (10 shared connections)
- [sync.py](sync.py.md) (9 shared connections)
- [sales/models.py](sales-models.py.md) (5 shared connections)
- [customers/views.py](customers-views.py.md) (4 shared connections)
- [system/views.py](system-views.py.md) (3 shared connections)
- [SalesLine](SalesLine.md) (3 shared connections)
- [OrderItem](OrderItem.md) (2 shared connections)
- [PosSale](PosSale.md) (2 shared connections)
- [parse_datetime](parse_datetime.md) (1 shared connections)
- [SyncService](SyncService.md) (1 shared connections)
- [test_import_core.py](test_import_core.py.md) (1 shared connections)

## Source Files

- `backend/apps/customers/management/commands/refresh_customer_tiers.py`
- `backend/apps/customers/tier_refresh.py`
- `backend/apps/customers/tiers.py`
- `backend/tests/test_customer_tiers.py`

## Audit Trail

- EXTRACTED: 127 (90%)
- INFERRED: 14 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*