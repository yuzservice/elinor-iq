# PosSaleItem

> God node · 49 connections · `backend/apps/sales/models.py`

**Community:** [sales/models.py](sales-models.py.md)

## Connections by Relation

### contains
- [sales/models.py](sales-models.py.md) `EXTRACTED`
- Meta `EXTRACTED`

### imports
- [sync.py](sync.py.md) `EXTRACTED`
- [analysis.py](analysis.py.md) `EXTRACTED`
- [list_query.py](list_query.py.md) `EXTRACTED`
- semantics.py `EXTRACTED`
- [test_pos_sync.py](test_pos_sync.py.md) `EXTRACTED`
- [tiers.py](tiers.py.md) `EXTRACTED`
- [detail.py](detail.py.md) `EXTRACTED`
- [test_sales_overview.py](test_sales_overview.py.md) `EXTRACTED`
- [test_sales_analysis.py](test_sales_analysis.py.md) `EXTRACTED`
- [intelligence.py](intelligence.py.md) `EXTRACTED`
- [test_customer_tiers.py](test_customer_tiers.py.md) `EXTRACTED`
- [test_customer_list.py](test_customer_list.py.md) `EXTRACTED`
- [test_import_core.py](test_import_core.py.md) `EXTRACTED`
- test_sales_kpis.py `EXTRACTED`
- test_product_intelligence.py `EXTRACTED`
- campaigns.py `EXTRACTED`
- test_customer_360.py `EXTRACTED`
- diagnose_pos_sync.py `EXTRACTED`
- audit.py `EXTRACTED`
- sync_elinor_pos.py `EXTRACTED`
- *…and 1 more `imports` connection(s) not listed (lowest-degree first to go)*

### uses
- [SyncService](SyncService.md) `INFERRED`
- qualifying_pos_items() `INFERRED`
- filter_by_sales_line_pos() `INFERRED`
- audit_imported() `INFERRED`
- test_customer_list_diverse_filters_and_sorting() `INFERRED`
- test_core_historical_import_idempotent_and_relationships() `INFERRED`
- test_pos_sync_upserts_sale_and_items() `INFERRED`
- [Command](Command.md) `INFERRED`
- [Command](Command.md) `INFERRED`
- test_trend_amount_ignores_zero_real_amount() `INFERRED`
- tier_lifetime_amount_expression() `INFERRED`
- pos_refund_items() `INFERRED`
- _pos_item() `INFERRED`
- _pos_item() `INFERRED`
- _product_history() `INFERRED`
- _pos() `INFERRED`
- test_monthly_trend_tolerates_orphan_pos_items() `INFERRED`
- _hydrate_purchase_items() `INFERRED`
- pos_exchange_replacement_items() `INFERRED`
- _units_purchased() `INFERRED`
- *…and 6 more `uses` connection(s) not listed (lowest-degree first to go)*

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*