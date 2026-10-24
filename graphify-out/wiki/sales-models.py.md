# sales/models.py

> 43 nodes · cohesion 0.06

## Key Concepts

- **sales/models.py** (58 connections) — `backend/apps/sales/models.py`
- **PosSaleItem** (49 connections) — `backend/apps/sales/models.py`
- **customers/models.py** (40 connections) — `backend/apps/customers/models.py`
- **django_db** (33 connections)
- **campaigns.py** (23 connections) — `backend/apps/customers/campaigns.py`
- **audit.py** (20 connections) — `backend/apps/integrations/elinor/dump_import/audit.py`
- **audit_imported()** (16 connections) — `backend/apps/integrations/elinor/dump_import/audit.py`
- **sales/admin.py** (7 connections) — `backend/apps/sales/admin.py`
- **django_contrib** (7 connections)
- **customers/admin.py** (3 connections) — `backend/apps/customers/admin.py`
- **CustomerQuerySet** (3 connections) — `backend/apps/customers/models.py`
- **customers/migrations/0001_initial.py** (2 connections) — `backend/apps/customers/migrations/0001_initial.py`
- **customers/migrations/0004_customer_list_indexes.py** (2 connections) — `backend/apps/customers/migrations/0004_customer_list_indexes.py`
- **0005_customer_tier.py** (2 connections) — `backend/apps/customers/migrations/0005_customer_tier.py`
- **CustomerLevel** (2 connections) — `backend/apps/customers/models.py`
- **CustomerRole** (2 connections) — `backend/apps/customers/models.py`
- **_inventory_tables_present()** (2 connections) — `backend/apps/integrations/elinor/dump_import/audit.py`
- **elinor/migrations/0001_initial.py** (2 connections) — `backend/apps/integrations/elinor/migrations/0001_initial.py`
- **0002_importrun.py** (2 connections) — `backend/apps/integrations/elinor/migrations/0002_importrun.py`
- **0003_elinor_api_config.py** (2 connections) — `backend/apps/integrations/elinor/migrations/0003_elinor_api_config.py`
- **0004_pos_day_sync.py** (2 connections) — `backend/apps/integrations/elinor/migrations/0004_pos_day_sync.py`
- **0005_pos_day_sync_api_count.py** (2 connections) — `backend/apps/integrations/elinor/migrations/0005_pos_day_sync_api_count.py`
- **0003_pos_sale_index_cleanup.py** (2 connections) — `backend/apps/sales/migrations/0003_pos_sale_index_cleanup.py`
- **sales/migrations/0004_customer_list_indexes.py** (2 connections) — `backend/apps/sales/migrations/0004_customer_list_indexes.py`
- **0003_alter_smartdirectevent_event_type.py** (2 connections) — `backend/apps/smart_direct/migrations/0003_alter_smartdirectevent_event_type.py`
- *... and 18 more nodes in this community*

## Relationships

- [Order](Order.md) (20 shared connections)
- [SalesLine](SalesLine.md) (17 shared connections)
- [Product](Product.md) (15 shared connections)
- [sync.py](sync.py.md) (14 shared connections)
- [test_import_core.py](test_import_core.py.md) (11 shared connections)
- [PosSale](PosSale.md) (9 shared connections)
- [django_db_models_deletion](django_db_models_deletion.md) (9 shared connections)
- [runner.py](runner.py.md) (8 shared connections)
- [OrderItem](OrderItem.md) (7 shared connections)
- [detail.py](detail.py.md) (7 shared connections)
- [list_query.py](list_query.py.md) (6 shared connections)
- [test_pos_sync.py](test_pos_sync.py.md) (6 shared connections)

## Source Files

- `backend/apps/core/admin.py`
- `backend/apps/customers/admin.py`
- `backend/apps/customers/campaigns.py`
- `backend/apps/customers/migrations/0001_initial.py`
- `backend/apps/customers/migrations/0004_customer_list_indexes.py`
- `backend/apps/customers/migrations/0005_customer_tier.py`
- `backend/apps/customers/models.py`
- `backend/apps/integrations/elinor/dump_import/audit.py`
- `backend/apps/integrations/elinor/migrations/0001_initial.py`
- `backend/apps/integrations/elinor/migrations/0002_importrun.py`
- `backend/apps/integrations/elinor/migrations/0003_elinor_api_config.py`
- `backend/apps/integrations/elinor/migrations/0004_pos_day_sync.py`
- `backend/apps/integrations/elinor/migrations/0005_pos_day_sync_api_count.py`
- `backend/apps/sales/admin.py`
- `backend/apps/sales/migrations/0003_pos_sale_index_cleanup.py`
- `backend/apps/sales/migrations/0004_customer_list_indexes.py`
- `backend/apps/sales/models.py`
- `backend/apps/smart_direct/migrations/0003_alter_smartdirectevent_event_type.py`

## Audit Trail

- EXTRACTED: 218 (86%)
- INFERRED: 36 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*