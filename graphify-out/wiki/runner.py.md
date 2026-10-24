# runner.py

> 76 nodes · cohesion 0.06

## Key Concepts

- **runner.py** (24 connections) — `backend/apps/integrations/elinor/dump_import/runner.py`
- **extract.py** (21 connections) — `backend/apps/integrations/elinor/dump_import/extract.py`
- **mapping.py** (21 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **load.py** (17 connections) — `backend/apps/integrations/elinor/dump_import/load.py`
- **run_core_import()** (15 connections) — `backend/apps/integrations/elinor/dump_import/runner.py`
- **load_extracted()** (14 connections) — `backend/apps/integrations/elinor/dump_import/load.py`
- **import_elinor_gateway_payments.py** (11 connections) — `backend/apps/integrations/elinor/management/commands/import_elinor_gateway_payments.py`
- **extract_dump()** (10 connections) — `backend/apps/integrations/elinor/dump_import/extract.py`
- **_row()** (9 connections) — `backend/apps/integrations/elinor/dump_import/extract.py`
- **pathlib** (9 connections)
- **analyze_gateway_payments.py** (8 connections) — `scripts/analyze_gateway_payments.py`
- **iter_insert_tuples()** (7 connections) — `backend/apps/integrations/elinor/dump_import/parser.py`
- **csv** (7 connections)
- **as_int()** (6 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **as_text()** (6 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **parser.py** (6 connections) — `backend/apps/integrations/elinor/dump_import/parser.py`
- **import_elinor_core.py** (6 connections) — `backend/apps/integrations/elinor/management/commands/import_elinor_core.py`
- **re** (6 connections)
- **export_gateway_payments_csv.py** (6 connections) — `scripts/export_gateway_payments_csv.py`
- **as_dt()** (5 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **domains_for_tables()** (5 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **sales_line_for_store()** (5 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **tables_for_domains()** (5 connections) — `backend/apps/integrations/elinor/dump_import/mapping.py`
- **Command** (5 connections) — `backend/apps/integrations/elinor/management/commands/import_elinor_gateway_payments.py`
- **ImportRun** (5 connections) — `backend/apps/integrations/elinor/models.py`
- *... and 51 more nodes in this community*

## Relationships

- [sales/models.py](sales-models.py.md) (8 shared connections)
- [sync.py](sync.py.md) (7 shared connections)
- [test_import_core.py](test_import_core.py.md) (7 shared connections)
- [OnlinePayment](OnlinePayment.md) (5 shared connections)
- [SalesLine](SalesLine.md) (3 shared connections)
- [sales/views.py](sales-views.py.md) (3 shared connections)
- [export.py](export.py.md) (2 shared connections)
- [Order](Order.md) (1 shared connections)
- [parse_datetime](parse_datetime.md) (1 shared connections)
- [detail.py](detail.py.md) (1 shared connections)
- [intelligence.py](intelligence.py.md) (1 shared connections)
- [test_customer_export.py](test_customer_export.py.md) (1 shared connections)

## Source Files

- `backend/apps/integrations/elinor/dump_import/extract.py`
- `backend/apps/integrations/elinor/dump_import/load.py`
- `backend/apps/integrations/elinor/dump_import/mapping.py`
- `backend/apps/integrations/elinor/dump_import/parser.py`
- `backend/apps/integrations/elinor/dump_import/runner.py`
- `backend/apps/integrations/elinor/gateway_payments.py`
- `backend/apps/integrations/elinor/management/commands/import_elinor_core.py`
- `backend/apps/integrations/elinor/management/commands/import_elinor_gateway_payments.py`
- `backend/apps/integrations/elinor/models.py`
- `backend/config/asgi.py`
- `backend/config/settings.py`
- `backend/config/wsgi.py`
- `backend/manage.py`
- `scripts/analyze_gateway_payments.py`
- `scripts/export_gateway_payments_csv.py`

## Audit Trail

- EXTRACTED: 197 (98%)
- INFERRED: 4 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*