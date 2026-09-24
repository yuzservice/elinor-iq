# ELINOR IQ v2 — Core Historical Import

**Status:** complete. Inventory, procurement, loyalty, campaigns, invoices/payments, and CMS were not imported.

## Source

- Dump: `source/elinor_new13-septamber-2026.sql` (MariaDB 10.6, database `elinor_new`, 5.4 GB)
- Coverage through **2026-09-13**
- Discovery: `docs/SOURCE_DATABASE_DISCOVERY.md`
- The original dump file was not modified

## Architecture

```
MariaDB SQL dump (read-only)
    → streaming INSERT parser (one pass, needed tables only)
    → CSV extract
    → PostgreSQL UNLOGGED staging + COPY
    → INSERT … ON CONFLICT (source_id) DO UPDATE
    → prune V2 source-backed rows whose source_id is not in the dump
    → Django domain models
    → existing React APIs
```

Temporary MariaDB was **not** used. The Django app never connects to the dump.

Application pages query only V2 PostgreSQL models (`customers`, `orders`, `pos_sales`, `products`, …). They do not read dump tables or staging tables.

## Existing API partial data

Before import, V2 held a partial API bootstrap (recent online orders/customers).

**Backup:** `backups/pre_core_historical_import.sql` (124 MB `pg_dump`, taken before historical load). Users/auth/settings were not dumped as a separate concern and were not deleted.

**Strategy:** upsert by `source_id` (dump overwrites overlapping profile/sale facts). After a full import, rows whose `source_id` is **absent from the dump** are deleted so the dump is canonical. That removed leftover API-only IDs (first pass: +314 customers / +1,214 orders). Users, sessions, and `sync_runs` were left intact.

## Target models

| Concept | Django model | Table |
|---|---|---|
| Customer | `Customer` | `customers` |
| Address | `CustomerAddress` | `customer_addresses` |
| Province / City | `Province`, `City` | `provinces`, `cities` |
| Club / role lookups | `CustomerLevel`, `CustomerRole` | `customer_levels`, `customer_roles` |
| Product / variant | `Product`, `Variant` | `products`, `variants` |
| Category / color / size | `Category`, `Color`, `ProductAttribute`, `ProductAttributeValue`, `VariantAttribute`, `ProductCategory` | corresponding tables |
| Online order | `Order` (conceptual **OnlineOrder**) | `orders` |
| Online item | `OrderItem` | `order_items` |
| Store lookup | `Store` | `stores` |
| POS sale | `PosSale` | `pos_sales` |
| POS item | `PosSaleItem` | `pos_sale_items` |

`Order` was kept as the online-order model so existing APIs stay on one table. There is no parallel `OnlineOrder` table.

`Variant.quantity` is never filled from the dump (no stock balances).

## Table mappings

| Source | Target | Notes |
|---|---|---|
| `provinces` | `Province` | |
| `cities` | `City` | `province_id` via `source_id` |
| `customers` | `Customer` | password / tokens / physical scores **not** imported |
| `addresses` | `CustomerAddress` | all rows; not “first address wins” |
| `levels` | `CustomerLevel` + `Customer.club_level` | |
| `customer_roles` | `CustomerRole` + `Customer.role_name` | |
| `categories` | `Category` | |
| `category_product` | `ProductCategory` | |
| `products` | `Product` | no supplier / purchase price / inventory |
| `colors` | `Color` + `Variant.color` / `color_name` | |
| `attributes` / `attribute_values` | `ProductAttribute*` | |
| `varieties` | `Variant` | no `purchase_price`, no stock |
| `attribute_variety` | `VariantAttribute`; size denormalized onto `Variant.size` when `attributes.name='size'` | |
| `stores` | `Store` | labels only; store 1 is not a sales line |
| `orders` | `Order` | statuses preserved; Shopino flag preserved |
| `order_items` | `OrderItem` | `amount` / `discount_amount` stored as facts |
| `mini_orders` | `PosSale` | `sales_line` derived from `store_id` |
| `mini_order_items` | `PosSaleItem` | refund `type` and `refrence_mini_order_item_id` preserved |

## Import order

1. provinces → cities → levels/roles → customers → addresses  
2. categories → products → colors → attributes → variants → relations  
3. stores  
4. online orders → order items  
5. POS sales → POS items  
6. denormalize size/color/address labels  
7. prune to dump `source_id`s  
8. refresh `Customer.order_count` / first / last from **online + POS**

## Branch mapping

Physical sales line is **only** `mini_orders.store_id`:

| `store_id` | `PosSale.sales_line` |
|---|---|
| 2 | `GORGAN` |
| 3 | `SARI` |
| 4 | `CAPRI` |

`stores.id = 1` (central warehouse) is stock location, not a sales line. Online orders have no `store_id`; `Order.sales_line` is always `ONLINE`.

## Customer identity

One `customers` table. Online `orders.customer_id` and POS `mini_orders.customer_id` both map to `Customer.source_id`. No per-branch customer entities.

## Transformation rules

- Naive MariaDB timestamps are treated as **Asia/Tehran** and stored as UTC (`timestamptz`). UI remains Jalali at display time only.
- Empty SQL `NULL` → NULL; text blanks stay `''`.
- Online `canceled` / `failed` are **statuses**, not returns.
- POS `type` `sell` / `refund` / `both` stored as-is. Refunds are not merged into sales.
- No revenue metric is computed at import time.
- No full raw JSON payload per historical row.

## Exclusions

Not imported: `store_items`, `store_item_transactions`, transfers, suppliers, wallets, deposits, transactions, physical scores/wallets, coupons/campaigns, invoices, payments, gateways, POS cashier requests, admins, audit logs, CMS, carts, newsletters, support, ACL, jobs, trash.

## CLI

```bash
docker compose exec backend python manage.py import_elinor_core --dump /source/elinor_new13-septamber-2026.sql
docker compose exec backend python manage.py import_elinor_core --dry-run
docker compose exec backend python manage.py import_elinor_core --only customers
docker compose exec backend python manage.py import_elinor_core --resume
```

`--resume` reuses extracted CSV under `/tmp/elinor_iq_core_import` if present. Upserts are idempotent.

## Performance

- Single dump scan; only 19 source tables extracted.
- PostgreSQL `COPY` into UNLOGGED staging, then set-based upsert.
- Successful aligned import: **125.97 seconds**.
- PostgreSQL size after import: **1674 MB**.

## Reconciliation (source tuple count vs V2)

| Entity | Source | Imported | Diff |
|---|---|---|---|
| customers | 270,728 | 270,728 | 0 |
| addresses | 219,700 | 219,700 | 0 |
| online orders | 297,095 | 297,095 | 0 |
| online items | 730,623 | 730,623 | 0 |
| POS sales | 172,680 | 172,680 | 0 |
| POS items | 349,042 | 349,042 | 0 |
| products | 7,369 | 7,369 | 0 |
| variants | 76,097 | 76,097 | 0 |

### POS branches

| Line | store_id | Imported |
|---|---|---|
| Sari | 3 | 102,687 |
| Gorgan | 2 | 67,248 |
| Capri | 4 | 2,745 |
| **Sum** | | **172,680** |

### Shared customers

| Group | Count |
|---|---|
| Online only | 127,732 |
| POS only | 67,828 |
| Both | 6,505 |
| No purchase | 68,663 |

6,505 both-channel customers matches discovery.

### Integrity

- Online/POS items missing product or variant: **0**
- POS orphan items: **0**
- Variants without product: **0**
- Guest online orders (`customer_id` null): **178**
- POS null customers: **0**
- Duplicate mobiles: **0** (270,728 unique)
- Inventory tables in PostgreSQL: **none**

### Date ranges (stored UTC)

| Entity | Min | Max |
|---|---|---|
| customers | 2022-01-06 15:33:39+00 | 2026-09-13 03:41:48+00 |
| online orders | 2022-01-12 08:54:08+00 | 2026-09-13 03:45:34+00 |
| POS | 2025-05-31 03:08:02+00 | 2026-09-13 03:41:48+00 |
| products | 2022-01-05 13:40:26+00 | 2026-09-09 03:07:12+00 |
| variants | 2022-01-05 14:36:31+00 | 2026-09-12 08:56:29+00 |

## Data-quality findings

- ~106k customers missing last name; ~106k missing first name; almost no email.
- 68,663 customers with no online or POS row.
- 75,974 variants missing SKU; 55,412 missing size; 6,193 missing color. Barcode present on all imported variants.
- Online mix includes large `failed` (18,742) and `canceled` (8,667) populations. Do not treat them as returns.
- POS: 861 cancelled, 566 soft-deleted headers, 779 refund tickets, 3,238 `both`, 4,584 refund lines.
- `amount` on items is stored without deciding unit vs line total.

## Unresolved semantics (unchanged from discovery)

- Canonical revenue definition (delivered vs paid vs tender).
- Whether `order_items.amount` is unit or line.
- How POS tenders reconcile to line amounts.
- Whether `not_checked` POS should appear in reports.
- Incomplete refund line references.
- Whether Shopino is a subchannel in the UI.
- Physical sales before 2025-05-31 (not in this dump).

## Compatibility notes

- `PARTIAL_DATA` coverage flag is **false** (full dump history is local).
- Home POS tiles show `connected: true` when `PosSale` exists, **without** assigning a revenue number.
- Customer 360 lists `orders` and `pos_sales`. `order_count` includes both channels.
- Sales dashboard metrics still use the previous **online** revenue-status definition. That is not a new metric contract.
