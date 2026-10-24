# OnlinePayment

> 23 nodes · cohesion 0.17

## Key Concepts

- **OnlinePayment** (23 connections) — `backend/apps/sales/models.py`
- **gateway_payments.py** (21 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **test_gateway_payments.py** (21 connections) — `backend/tests/test_gateway_payments.py`
- **upsert_order_gateway_payments()** (14 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **extract_order_payment_rows()** (13 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **diagnose_gateway_payments.py** (10 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_gateway_payments.py`
- **test_home_metric_cards_include_online_gateway_amounts()** (7 connections) — `backend/tests/test_gateway_payments.py`
- **test_sync_order_details_persists_gateway_payments()** (7 connections) — `backend/tests/test_gateway_payments.py`
- **Command** (6 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_gateway_payments.py`
- **test_extract_and_upsert_order_gateway_payments()** (6 connections) — `backend/tests/test_gateway_payments.py`
- **Command** (5 connections) — `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- **test_gateway_payment_upsert_is_idempotent()** (5 connections) — `backend/tests/test_gateway_payments.py`
- **_collect_invoice_dicts()** (4 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **django_db** (4 connections)
- **payment_paid_at()** (2 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **.handle()** (2 connections) — `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- **.handle()** (2 connections) — `backend/apps/integrations/elinor/management/commands/diagnose_gateway_payments.py`
- **Parse and persist online DigiPay / SnappPay payments from Elinor order payloads.** (1 connections) — `backend/apps/integrations/elinor/gateway_payments.py`
- **.add_arguments()** (1 connections) — `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- **BaseCommand** (1 connections)
- **BaseCommand** (1 connections)
- **Meta** (1 connections) — `backend/apps/sales/models.py`
- **Gateway attempt linked to an online invoice (amount denormalized for reporting).** (1 connections) — `backend/apps/sales/models.py`

## Relationships

- [Order](Order.md) (15 shared connections)
- [parse_datetime](parse_datetime.md) (10 shared connections)
- [SalesLine](SalesLine.md) (9 shared connections)
- [sync.py](sync.py.md) (9 shared connections)
- [sales/models.py](sales-models.py.md) (6 shared connections)
- [home_metrics.py](home_metrics.py.md) (5 shared connections)
- [runner.py](runner.py.md) (5 shared connections)
- [PosSale](PosSale.md) (3 shared connections)
- [list_query.py](list_query.py.md) (2 shared connections)
- [kpis.py](kpis.py.md) (2 shared connections)
- [SyncService](SyncService.md) (2 shared connections)
- [ElinorClient](ElinorClient.md) (1 shared connections)

## Source Files

- `backend/apps/integrations/elinor/gateway_payments.py`
- `backend/apps/integrations/elinor/management/commands/backfill_elinor_gateway_payments.py`
- `backend/apps/integrations/elinor/management/commands/diagnose_gateway_payments.py`
- `backend/apps/sales/models.py`
- `backend/tests/test_gateway_payments.py`

## Audit Trail

- EXTRACTED: 89 (78%)
- INFERRED: 25 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*