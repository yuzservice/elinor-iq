# Source stock discovery (initial stock and per-warehouse balances)

Date: 2026-11-09. Read-only investigation; no code, migration or data change in Elinor IQ.
Labels: **[V]** verified on the dump, the dev database or the code · **[A]** assumed.

Sources:
- Dump `source/elinor_new13-septamber-2026.sql` (MariaDB, 5.9 GB, latest stock row 2026-09-13 07:11). Stock tables
  were streamed with the existing parser (`dump_import/parser.py`) into a temporary SQLite file, analysed, then deleted.
- `apps/integrations/elinor/client.py`, `sync.py` (`_hydrate_product`), and product payloads already stored in the dev
  database.

Only aggregates are reported. Product ids appear for 5 example products; there is no customer data in this document.

## 1. Stock tables in the dump [V]

| Table | Rows | Dates (created) | What it is |
|---|---|---|---|
| `stores` | 4 | | 1 central (`is_main`), 2 Gorgan, 3 Sari, 4 Capri |
| `store_items` | 145,886 | 2025-05-30 → 2026-09-12 (updated to 09-13) | Current balance, one row per (warehouse, variety); unique |
| `store_item_transactions` | 1,913,839 | 2022-01-05 → 2026-09-13 | Stock ledger: `store_id`, `store_item_id`, `type` (increment / decrement), `quantity`, `description`, `order_id`, `mini_order_id`, `admin_id`, `is_hidden`, `is_fix` |
| `store_transfers` | 9,119 | 2025-05-31 → 2026-09-13 | Transfer headers: `from_store_id`, `to_store_id`, `status` (new / in_progress / sent / rolled_back) |
| `store_transfer_items` | 128,647 | same | Transfer lines per variety |
| `store_tracking_logs` | 14,039 | 2025-05-30 → 2026-09-12 | Manual balance edits (old / new balance) |
| `product_stocktakings` | 10,771 | 2025-05-30 → 2026-09-12 | Stocktaking events per (warehouse, product) |
| `store_transactions` | 673,093 | 2022-01-05 → 2025-05-30 | **Legacy single-stock ledger.** Its `store_id` holds values like 1000 and 10000, not a warehouse id |
| `stores_2` | 50,451 | updated until 2025-05-30 | **Legacy balance per variety** (one stock, no warehouses) |
| `transfers` | not extracted (AUTO_INCREMENT 36,242) | | Wallet money transfers (deposit / withdraw), **not stock** |

The multi-warehouse system started on **2025-05-30**. Before that, every ledger row is in warehouse 1 (the old single
stock). Balances on 2026-09-13 (`store_items`): central 27,339 units, Gorgan 4,157, Sari 5,951, Capri 419.

### Meaning of ledger rows

There is no movement-type column; the meaning comes from the links and the `description` text:

| Category | Rule | Visible rows since 2025-05-30 |
|---|---|---|
| Online sale / return | `order_id` set; decrement / increment | central only: 206,642 sales, 25,513 returns |
| POS sale / return | `mini_order_id` set | Gorgan 58,048 / 2,733; Sari 101,243 / 3,830; Capri 3,560 / 37 |
| Transfer out / in | «حواله انتقال از … به …» | central → shops 138,204 rows (212,162 units); shops → central 24,665 rows |
| New product entry | «موجودی اولیه محصول» | central 25,582 rows |
| Stock correction | «بروزرسانی موجودی محصول افزایش / کاهش # عددی» | central 18,221 up, 389 down (one row of 718,981 units on 2026-02-28 corrects a bad entry) |
| Charge | «شارژی» | central 799 rows (common before 2025-05-30: 19,900) |
| Direct shop receipt | free text, mostly «از بار», «بار», a number | Gorgan 37,663 rows (41,150 units); Sari 39,734 rows (57,491 units) |
| Other manual | free text («ندارن», «خیاطی», «سفارش مشتری», …) | a few thousand rows per warehouse |

`is_hidden` marks rows that cancel each other: about half of all shop rows are hidden (for example Sari POS sales:
115,017 of 216,260). `is_fix` appears only on a few thousand shop increments.

## 2. Answers

**Can `store_items` be rebuilt from the ledger?** Yes, from **visible rows only** (`is_hidden = 0`), over the whole
history [V]:

| Rows counted | Items whose balance ≠ increments − decrements |
|---|---|
| All rows | 15.2% (shops 31%) |
| **Visible rows only** | **1.3%** (central 1.9%, Gorgan 0.2%, Sari 1.5%, Capri 0.0%) |
| Visible rows since 2025-05-30 | 3.1% (central 5.3%) |

Every ledger `store_item_id` has a `store_items` row.

**Per variant or per product? Per warehouse?** Per variety (size/colour) **and** per warehouse: `store_items` has one
row per (warehouse, variety), with no duplicates [V].

**How do goods arrive?** Both ways [V]:
- New products enter central as «موجودی اولیه محصول», then go to the shops by transfer. Sent transfers: 1→3 4,681,
  1→2 1,873, 1→4 182, back to central 902 + 769 + 134, between shops 354 + 20 + 24 + 2.
- Shops also receive goods directly («از بار»). That is about half of their inflow: Gorgan 41,150 units direct vs
  38,589 transferred in; Sari 57,491 vs 63,370.
- A product's first receipt is sometimes a direct shop delivery, with the central entry days later.

**Do online orders decrement central (store 1)?** Yes [V]: all 206,642 visible order-linked decrements are in warehouse
1 (one exception in Gorgan). Returns of online orders increment warehouse 1.

**Freshness.** The latest ledger row in the dump is 2026-09-13 07:11, **57 days old** today [V].

## 3. «شارژ اولیه» (initial charge)

Tested on 3,063 products whose first receipt is on or after 2025-06-01 (fully inside the new system) and that have
sales. "Receipt" = external inflow: «موجودی اولیه», «شارژی», stock correction up, and direct shop receipts. Transfers
are internal and excluded; sold = sales − returns from the same ledger.

Comparing sales and receipts **in the same window** (a sale beyond receipts is impossible) [V]:

| Definition: receipts in all warehouses … | Products with sold > charge |
|---|---|
| in the first 7 days after the first receipt | 6.9% (183 of 2,661) |
| **in the first 30 days after the first receipt** | **8.0%** (239 of 2,994) |
| over the whole life | 10.9% (333 of 3,063) |
| over the whole life, hidden rows included | 3.7% (97 of 2,597) |

Comparing lifetime sales with an early-window charge is not meaningful: fast sellers are restocked many times. Taking
only the central «موجودی اولیه» entry, 84% of products sell more than it.

Five fastest sellers (units; charge definitions as above):

| Product id | Sold (life) | «موجودی اولیه» only | First 7 days | First 30 days | Life | Sold in first 30 days |
|---|---|---|---|---|---|---|
| 4310 | 3,666 | 119 | 196 | 460 | 6,543 | 197 |
| 694 | 1,980 | 123 | 153 | 337 | 5,094 | 75 |
| 7494 | 1,936 | 235 | 56 | 138 | 2,769 | 51 |
| 6526 | 1,768 | 581 | 34 | 61 | 2,994 | 12 |
| 4452 | 1,735 | 268 | 180 | 313 | 3,117 | 63 |

**Proposal:** «شارژ اولیه» = all external receipts of the product, in all warehouses and variants, in the **first 30
days** after its first receipt. It errs for **8.0%** of products; mark those as "uncertain" instead of hiding them.
Probable causes [A]: receipts entered as hidden rows (the hidden-rows test drops the error to 3.7%), receipts written as
free text that the rules miss, and sales booked before the receipt.

## 4. Live API

- **Client endpoints [V]:** `/admin/login`, `/admin/orders_light`, `/admin/orders/{id}`, invoices, `/admin/customers`,
  `/admin/products/{id}`, `/admin/mini_orders`, `/admin/actions`. **No stock, warehouse or movement endpoint** is
  known, and no Elinor API documentation in the repo lists one.
- **Product payload [V]** (stored payloads): product `total_quantity`, `low_stock_quantity_warning`, `show_quantity`;
  each variety has `quantity` and `main_balance` (always equal in the 3,394 compared varieties). There is no
  per-warehouse field.
- **What `main_balance` is:** for products fetched 5 to 7 days after the dump, it equals the dump's **central (store
  1)** balance for 73% of varieties, versus 56% for the sum of all warehouses. The dump-to-fetch gap explains much of the
  rest, so it is most likely **central-only stock** [A]. `total_quantity` matched neither (11% and 4%).
- **Why products are never refreshed [V]:** `_hydrate_product` returns early when `product.synced_at` is set. A product
  is fetched once, the first time it appears in an online order. Products never sold online are never fetched. Only
  9,051 of 77,729 dev variants have a stored quantity.
- **Live sample call: not made.** `api.elinorboutique.com` is unreachable from the dev Mac (timeout); the server can
  reach it. Optional check for the owner, on the server, one call:
  `docker compose exec backend python manage.py shell -c "from apps.integrations.elinor.client import ElinorClient as C; v=C().get_product(4310)['varieties'][0]; print(sorted(k for k in v if 'balance' in k or 'quant' in k or 'store' in k))"`

## 5. Recommendation

| Need | Source | Freshness |
|---|---|---|
| Initial stock («شارژ اولیه») | **Dump ledger** (`store_item_transactions`, visible rows), definition in §3 | As of the dump; history does not change, so occasional dumps are enough |
| Per-warehouse stock (central, Gorgan, Sari, Capri) | **Dump only**: `store_items` (reconciles with the ledger for 98.7% of items) | As of the dump (today 57 days old) |
| Central stock, fresher | API `/admin/products/{id}` → `main_balance` per variety (central only [A]) | Needs a new refresh job: about 7,600 products at 45 requests per minute ≈ 3 hours for a full pass; a daily pass over products in focus (for example those in Pulse) is feasible |

Keeping per-shop stock fresh needs a regular dump (for example weekly), read-only database access, or a new stock
endpoint from the Elinor vendor. The current API cannot give per-shop balances.

## 6. Risks and open questions for the owner

1. **Dump cadence:** can the vendor provide a dump weekly (or read-only database access)? Per-shop stock is only as
   fresh as the latest dump.
2. **Stock endpoint:** can the vendor expose `store_items` (balance per warehouse and variety) and the ledger through the
   API? This would make stock fresh without dumps.
3. **`main_balance`:** confirm with the vendor that it is the central warehouse only (73% match) [A].
4. **Hidden rows:** what does `is_hidden` mean in the shop panel? Excluding them reconciles balances; including them
   lowers the initial-charge error. The rule should come from the vendor.
5. **Free-text receipts:** shops record direct deliveries as free text («از بار»). A fixed receipt type would make
   «شارژ اولیه» exact.
6. **Data error:** one correction of 718,981 units on 2026-02-28 shows that very large entries happen; any import needs
   an outlier guard.
7. **Legacy period:** stock before 2025-05-30 is one central stock (`stores_2`, `store_transactions`); per-warehouse
   history starts on 2025-05-30, and Capri's from 2025-12-14.
8. `Variant.quantity` in Elinor IQ is still a one-time snapshot and must not be shown as current stock (CLAUDE.md rule
   stays).
