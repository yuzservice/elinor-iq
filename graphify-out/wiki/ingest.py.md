# ingest.py

> 24 nodes · cohesion 0.17

## Key Concepts

- **ingest.py** (19 connections) — `backend/apps/customers/ingest.py`
- **test_customers.py** (18 connections) — `backend/tests/test_customers.py`
- **customer_record()** (11 connections) — `backend/apps/customers/ingest.py`
- **extract_profile_fields()** (11 connections) — `backend/apps/customers/ingest.py`
- **apply_customer_payload()** (10 connections) — `backend/apps/customers/ingest.py`
- **upsert_customer_from_source()** (10 connections) — `backend/apps/customers/ingest.py`
- **normalize_addresses()** (7 connections) — `backend/apps/customers/ingest.py`
- **repair_stored_customer_profiles()** (7 connections) — `backend/apps/customers/ingest.py`
- **addresses_for()** (5 connections) — `backend/apps/customers/ingest.py`
- **_first_text()** (5 connections) — `backend/apps/customers/ingest.py`
- **django_db** (5 connections)
- **test_customer_profile_fields_and_addresses_from_payload()** (5 connections) — `backend/tests/test_customers.py`
- **0002_customer_profile_fields.py** (4 connections) — `backend/apps/customers/migrations/0002_customer_profile_fields.py`
- **._hydrate_customer()** (4 connections) — `backend/apps/integrations/elinor/sync.py`
- **test_all_customers_vs_purchasing_customers()** (4 connections) — `backend/tests/test_customers.py`
- **test_customer_api_populations_fallback_and_addresses()** (4 connections) — `backend/tests/test_customers.py`
- **test_customer_fallback_display_does_not_fabricate_source_id_name()** (4 connections) — `backend/tests/test_customers.py`
- **test_wrapped_customer_detail_keeps_mobile_name_and_address()** (4 connections) — `backend/tests/test_customers.py`
- **backfill_profile_fields()** (2 connections) — `backend/apps/customers/migrations/0002_customer_profile_fields.py`
- **Upsert customers from any ingestion source into local PostgreSQL.** (1 connections) — `backend/apps/customers/ingest.py`
- **Fill profile fields without wiping richer values or order statistics.** (1 connections) — `backend/apps/customers/ingest.py`
- **Fill mobile, name, and address from detail payloads already saved in the wrong…** (1 connections) — `backend/apps/customers/ingest.py`
- **Return the customer object from a detail response. Elinor's customer endpoint…** (1 connections) — `backend/apps/customers/ingest.py`
- **Migration** (1 connections) — `backend/apps/customers/migrations/0002_customer_profile_fields.py`

## Relationships

- [parse_datetime](parse_datetime.md) (11 shared connections)
- [Order](Order.md) (11 shared connections)
- [detail.py](detail.py.md) (7 shared connections)
- [sync.py](sync.py.md) (5 shared connections)
- [ElinorClient](ElinorClient.md) (4 shared connections)
- [sales/models.py](sales-models.py.md) (4 shared connections)
- [SyncService](SyncService.md) (3 shared connections)
- [test_import_core.py](test_import_core.py.md) (1 shared connections)

## Source Files

- `backend/apps/customers/ingest.py`
- `backend/apps/customers/migrations/0002_customer_profile_fields.py`
- `backend/apps/integrations/elinor/sync.py`
- `backend/tests/test_customers.py`

## Audit Trail

- EXTRACTED: 87 (92%)
- INFERRED: 8 (8%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*