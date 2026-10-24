# test_platform_access.py

> 14 nodes · cohesion 0.21

## Key Concepts

- **test_platform_access.py** (11 connections) — `backend/tests/test_platform_access.py`
- **ElinorApiConfig** (9 connections) — `backend/apps/integrations/elinor/models.py`
- **current_elinor_credentials()** (8 connections) — `backend/apps/integrations/elinor/client.py`
- **django_db** (3 connections)
- **test_blank_api_password_keeps_the_saved_one()** (3 connections) — `backend/tests/test_platform_access.py`
- **test_super_admin_saves_api_and_creates_layer_two_admin()** (3 connections) — `backend/tests/test_platform_access.py`
- **.__init__()** (2 connections) — `backend/apps/integrations/elinor/client.py`
- **fixture** (2 connections)
- **super_admin()** (2 connections) — `backend/tests/test_platform_access.py`
- **super_api()** (2 connections) — `backend/tests/test_platform_access.py`
- **test_layer_two_admin_cannot_manage_platform()** (2 connections) — `backend/tests/test_platform_access.py`
- **Prefer credentials saved in the panel. Fall back to environment variables.** (1 connections) — `backend/apps/integrations/elinor/client.py`
- **Meta** (1 connections) — `backend/apps/integrations/elinor/models.py`
- **Panel-managed Elinor API credentials. Environment values are only a fallback.** (1 connections) — `backend/apps/integrations/elinor/models.py`

## Relationships

- [system/views.py](system-views.py.md) (4 shared connections)
- [ElinorClient](ElinorClient.md) (4 shared connections)
- [sync.py](sync.py.md) (2 shared connections)
- [test_import_core.py](test_import_core.py.md) (1 shared connections)
- [conftest.py](conftest.py.md) (1 shared connections)

## Source Files

- `backend/apps/integrations/elinor/client.py`
- `backend/apps/integrations/elinor/models.py`
- `backend/tests/test_platform_access.py`

## Audit Trail

- EXTRACTED: 28 (90%)
- INFERRED: 3 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*