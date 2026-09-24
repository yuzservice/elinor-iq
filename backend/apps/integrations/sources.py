"""Ingestion sources write into local PostgreSQL models keyed by source_id.

Application pages and APIs read only from those local models. Elinor HTTP
sync and SQL dump import are interchangeable writers for the same
Customer, Order (online), OrderItem, PosSale, PosSaleItem, Product, and Variant rows.
"""

SOURCE_ELINOR_API = "elinor_api"
SOURCE_SQL_IMPORT = "sql_import"
