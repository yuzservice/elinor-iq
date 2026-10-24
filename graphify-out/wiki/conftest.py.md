# conftest.py

> 17 nodes · cohesion 0.15

## Key Concepts

- **conftest.py** (29 connections) — `backend/tests/conftest.py`
- **test_sync.py** (19 connections) — `backend/tests/test_sync.py`
- **test_bootstrap_upsert_is_idempotent()** (10 connections) — `backend/tests/test_sync.py`
- **django_contrib_auth** (6 connections)
- **bootstrap_window()** (5 connections) — `backend/apps/integrations/elinor/sync.py`
- **create_admin.py** (4 connections) — `backend/apps/accounts/management/commands/create_admin.py`
- **accounts/admin.py** (3 connections) — `backend/apps/accounts/admin.py`
- **fixture** (3 connections)
- **test_bootstrap_window_is_about_three_months()** (3 connections) — `backend/tests/test_sync.py`
- **UserAdmin** (2 connections) — `backend/apps/accounts/admin.py`
- **admin_user()** (2 connections) — `backend/tests/conftest.py`
- **api()** (2 connections) — `backend/tests/conftest.py`
- **auth_api()** (2 connections) — `backend/tests/conftest.py`
- **django_db** (2 connections)
- **unittest_mock** (2 connections)
- **register** (1 connections)
- **rest_framework_test** (1 connections)

## Relationships

- [sync.py](sync.py.md) (11 shared connections)
- [Order](Order.md) (8 shared connections)
- [Product](Product.md) (8 shared connections)
- [sales/models.py](sales-models.py.md) (5 shared connections)
- [SyncService](SyncService.md) (5 shared connections)
- [ElinorClient](ElinorClient.md) (5 shared connections)
- [OrderItem](OrderItem.md) (3 shared connections)
- [test_import_core.py](test_import_core.py.md) (2 shared connections)
- [runner.py](runner.py.md) (1 shared connections)
- [Command](Command.md) (1 shared connections)
- [parse_datetime](parse_datetime.md) (1 shared connections)
- [detail.py](detail.py.md) (1 shared connections)

## Source Files

- `backend/apps/accounts/admin.py`
- `backend/apps/accounts/management/commands/create_admin.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/tests/conftest.py`
- `backend/tests/test_sync.py`

## Audit Trail

- EXTRACTED: 67 (89%)
- INFERRED: 8 (11%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*