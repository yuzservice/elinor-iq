# PosSale

> God node · 75 connections · `backend/apps/sales/models.py`

**Community:** [PosSale](PosSale.md)

## Connections by Relation

### contains
- [sales/models.py](sales-models.py.md) `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- [analysis.py](analysis.py.md) `EXTRACTED`
- services.py `EXTRACTED`
- [system/views.py](system-views.py.md) `EXTRACTED`
- [list_query.py](list_query.py.md) `EXTRACTED`
- semantics.py `EXTRACTED`
- [test_pos_sync.py](test_pos_sync.py.md) `EXTRACTED`
- [tiers.py](tiers.py.md) `EXTRACTED`
- [kpis.py](kpis.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
- [test_sales_analysis.py](test_sales_analysis.py.md) `EXTRACTED`
- [test_customer_tiers.py](test_customer_tiers.py.md) `EXTRACTED`
- core/views.py `EXTRACTED`
- [test_customer_list.py](test_customer_list.py.md) `EXTRACTED`
- [test_import_core.py](test_import_core.py.md) `EXTRACTED`
- test_sales_kpis.py `EXTRACTED`
- test_product_intelligence.py `EXTRACTED`
- campaigns.py `EXTRACTED`
- test_customer_360.py `EXTRACTED`
- diagnose_pos_sync.py `EXTRACTED`
- *…and 10 more `imports` connection(s) not listed (lowest-degree first to go)*

### uses
- [SyncService](SyncService.md) `INFERRED`
- qualifying_pos_sales() `INFERRED`
- metrics_for_customers() `INFERRED`
- status_view() `INFERRED`
- home_summary() `INFERRED`
- audit_imported() `INFERRED`
- physical_returns_report() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- pos_range_activity() `INFERRED`
- _returns_canceled_counts() `INFERRED`
- recent_sales_payload() `INFERRED`
- test_pos_sync_upserts_sale_and_items() `INFERRED`
- get_campaigns_summary() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_sales_filter_options_from_live_data() `INFERRED`
- _pos() `INFERRED`
- [Command](Command.md) `INFERRED`
- test_repair_mismatched_pos_day_syncs() `INFERRED`
- _pos() `INFERRED`
- [Command](Command.md) `INFERRED`
- *…and 23 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*