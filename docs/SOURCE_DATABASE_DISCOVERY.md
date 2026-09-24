# ELINOR IQ v2 — Source Database Discovery

**Phase:** read-only analysis. No data was imported into ELINOR IQ v2 PostgreSQL. The dump file was not modified. No source tables were created, altered, updated, or deleted.

**Dump file actually used:** `source/elinor_new13-septamber-2026.sql` (5.4 GB).  
The path `source/elinor_source.sql` does not exist in this workspace.

**Engine:** MariaDB 10.6.25 dump of database `elinor_new` (mysqldump, UTF-8).  
**Method:** streaming metadata extraction (`CREATE TABLE`) plus quote-aware `INSERT` tuple counting. Row counts are `COUNT(*)`-equivalent tuple counts, not `AUTO_INCREMENT` values.  
**Dump coverage:** data through **2026-09-13**.  
**Temporary MariaDB:** not used. Isolated container load was not required.

---

## 1. Source database overview

This is one Laravel/MariaDB application database. Online checkout and in-store POS share:

- one customer table (`customers`)
- one product/variant catalog (`products`, `varieties`)

They do **not** share one sales table. Online sales live in `orders` / `order_items`. Physical POS sales live in `mini_orders` / `mini_order_items`.

There are **133** tables. Inventory, CMS, jobs, and marketing tables exist alongside sales.

### Sales line vs stock location (do not mix)

| Concept | Source | Meaning |
|---|---|---|
| **Sales line** | `orders` table **or** `mini_orders.store_id` + `sell_types` | Where the sale happened: Online / Sari / Gorgan / Capri |
| **Stock location** | `stores` | Warehouse: central + three shop warehouses |

`stores` (4 rows):

| `stores.id` | Label | `is_main` | Role |
|---|---|---|---|
| 1 | انبار مرکزی | 1 | Central warehouse. **Not a POS sales line.** No `mini_orders` use this id. |
| 2 | انبار فروشگاه گرگان | 0 | Gorgan shop warehouse **and** Gorgan POS identifier |
| 3 | انبار فروشگاه ساری | 0 | Sari shop warehouse **and** Sari POS identifier |
| 4 | انبار کاپری | 0 | Capri shop warehouse **and** Capri POS identifier |

`sell_types` (POS sales-line catalog only; no Online row):

| `sell_types.id` | `title` | `label` |
|---|---|---|
| 1 | gorgan | فروش حضوری گرگان |
| 2 | sari | فروش حضوری ساری |
| 3 | capri | کاپری |

`sell_type_store` maps sales line → shop warehouse, **excluding** central store 1:

- gorgan (`sell_types.id=1`) → `stores.id=2`
- sari (`sell_types.id=2`) → `stores.id=3`
- capri (`sell_types.id=3`) → `stores.id=4`

Online orders have **no** `store_id`. Central warehouse may be used for **stock movement** of website orders (`store_item_transactions.order_id`). That is inventory, not the Online sales line.

---

## 2. Customer master

### Canonical table: `customers`

Primary key: `customers.id` (`bigint` unsigned).

| Field | Column | Notes |
|---|---|---|
| PK | `id` | Shared by online and POS FKs |
| Mobile | `mobile` | `NOT NULL`, **UNIQUE**. No duplicate mobiles at DB level |
| First / last name | `first_name`, `last_name` | Nullable |
| Email | `email` | Nullable |
| National code | `national_code` | Nullable |
| Gender | `gender` | `enum('male','female')`, nullable |
| Birth date | `birth_date` | `date`, nullable |
| Account status | `status` | `tinyint`, default 1 |
| Created / updated | `created_at`, `updated_at` | |
| Club level | `level_id` | FK-like int to `levels` (no declared FK) |
| Customer role | `role_id` | Int; `customer_roles` currently contains VIP (`id=2`) only |
| Physical club | `physical_scores`, `physical_club_is_active` | POS loyalty-ish; out of current scope |
| Other | `card_number`, `newsletter`, `foreign_national`, `digipay`, `summary` | |

There is **no** `branch_id` / `store_id` on customers. The registry is global.

### Addresses

`addresses.customer_id` → `customers.id` (CASCADE).  
`addresses.city_id` → `cities.id` → `provinces`.  
Soft-deleted via `addresses.deleted_at`.  
219,700 address rows.

### Club / level lookup

`levels` (created 2026-08-02 in source data): الماسی (1), طلایی (2), نقره ای (3), برنزی (4).  
Most customers have `level_id` NULL (club appears new / sparsely populated).

### How every sales system references customers

| Channel | Table | Column | Constraint |
|---|---|---|---|
| Online | `orders` | `customer_id` | FK → `customers.id` ON DELETE SET NULL |
| POS (all shops) | `mini_orders` | `customer_id` | FK → `customers.id` ON DELETE SET NULL |

There is no separate Gorgan/Sari/Capri customer table.

**Evidence that the customer population is shared:**

1. Both FKs point at the same `customers.id`.
2. 6,505 distinct `customer_id` values appear on **both** `orders` and `mini_orders`.
3. `customers` has no store/branch discriminator.

### Customer quality snapshot (tuple counts)

| Metric | Count |
|---|---|
| Customers | 270,728 |
| Unique customers on online `orders` | 134,237 |
| Unique customers on POS `mini_orders` | 74,333 |
| Customers with **both** online and POS | 6,505 |
| Purchasing customers (union) | 202,065 |
| Customers with **no** online or POS row | **68,663** |
| `first_name` empty/null | 105,991 |
| `last_name` empty/null | 106,190 |
| `email` present | 3,058 |
| `national_code` present | 10,766 |
| `gender` set | 2,563 (female 2,541 / male 22 / NULL 268,165) |
| `birth_date` present | 1,928 |
| `status=1` | 270,723 |
| `status=0` | 5 |
| `role_id=2` (VIP) | 1,447 |
| `role_id=3` (no matching `customer_roles` row in dump) | 1 |
| `role_id` NULL | 269,280 |
| `level_id` NULL | 269,781 |
| `level_id` 1/2/3/4 | 151 / 109 / 254 / 433 |
| Mobile length 11 | 270,699 |
| Other mobile lengths | 29 |
| Non-digit mobiles | 2 |
| NULL/empty mobile | **0** (column is NOT NULL UNIQUE) |

`created_at` range: **2022-01-06 19:03:39 .. 2026-09-13 07:11:48**.

### Guest / staff / operational

- **Guest online:** 178 `orders` have `customer_id` NULL. POS: **0** null `customer_id` on `mini_orders`.
- **Staff:** POS operators live in `admins` (separate from `customers`), with `admins.sell_type_id` → `sell_types`. Every `mini_orders.creatorable_type` is `Modules\Admin\Entities\Admin`. That does not make those admins customer records.
- Whether some `customers` rows are staff/test accounts cannot be proven from schema alone. Not cleaned in this phase.

Duplicate mobiles cannot exist at the database layer. Near-duplicates (leading zero, extra digits, 10-character numbers) can exist as distinct UNIQUE values.

---

## 3. Online sales schema

Website/online checkout is **structurally separate** from POS.

```
customers
  └── orders                    # website (+ Shopino flag)
        ├── order_items
        │     ├── products
        │     └── varieties
        ├── addresses           # optional FK
        ├── shippings
        ├── coupons             # optional FK
        ├── invoices            # polymorphic payable = Order
        │     └── payments      # gateway attempts
        └── order_status_logs / order_logs / order_item_logs
```

### `orders` (297,095 rows)

| Concern | Column |
|---|---|
| PK | `id` |
| Customer | `customer_id` → `customers.id` (nullable) |
| Status | `status` enum: `wait_for_payment`, `in_progress`, `delivered`, `new`, `canceled`, `failed`, `reserved`, `in_examination`, `presale` |
| Created | `created_at` |
| Item rollups | `items_count`, `items_quantity` |
| Order discount | `discount_amount` |
| Shipping | `shipping_id`, `shipping_amount`, `shipping_title`, packet fields, `has_free_shipping` |
| Order total | `total_amount` |
| Coupon | `coupon_id` |
| Address | `address_id` + JSON `address` + denormalized name/city/province |
| Shopino | `is_shopino` |
| Digify | `is_digify` |
| Cancel timestamp | `canceled_at` (sparse; see returns) |
| No store | **no `store_id`** |

Status distribution:

| status | rows |
|---|---|
| delivered | 266,822 |
| failed | 18,742 |
| canceled | 8,667 |
| reserved | 2,721 |
| in_progress | 122 |
| wait_for_payment | 13 |
| new | 5 |
| in_examination | 3 |
| presale | 0 in this dump |

Shopino: `is_shopino=1` on **28,649** orders (still the Online sales line, marketplace sub-channel).  
Digify: `is_digify=1` on 919 orders.  
`created_at`: **2022-01-12 12:24:08 .. 2026-09-13 07:15:34**.

### `order_items` (730,623 rows)

| Concern | Column |
|---|---|
| Order | `order_id` → `orders.id` CASCADE |
| Product | `product_id` → `products.id` |
| Variant | `variety_id` → `varieties.id` SET NULL — **present on all 730,623 rows** |
| Qty | `quantity` |
| Line/unit amount | `amount` |
| Line discount | `discount_amount` |
| Item status | `status` tinyint (1 = 717,843; 0 = 12,780) |

First-row sample (not a rule): `quantity=2`, `amount=10000`, `discount_amount=10000`. Whether `amount` is unit price or line total is **not** decided here.

### Online relationship chain (actual names)

`customers.id` → `orders.customer_id` → `order_items.order_id` → `order_items.variety_id` → `varieties.id` → `varieties.product_id` → `products.id`  
(`order_items.product_id` also points at `products.id` directly.)

### Shopino / gateways

- Shopino is a flag on `orders`, not a separate order table.
- Gateway **configuration** is `gateways` (names only for this document: virtual, saman, zarinpal, digipay, parsian, pasargad, digikala, snapppay). Secrets exist in dump JSON and must not be copied into v2.
- Actual payment attempts: `payments.gateway` + `payments.status` via `invoices`.

---

## 4. POS sales schema

Physical sales **are** `mini_orders` / `mini_order_items`. That naming is still correct in this dump.

### `mini_orders` (172,680 rows)

| Concern | Column |
|---|---|
| PK | `id` |
| Customer | `customer_id` → `customers.id` (nullable in schema; **0 nulls in data**) |
| Branch / shop | **`store_id`** (int, **no FK**, values 2/3/4 only) |
| Type | `type` enum `sell` / `refund` / `both` |
| Confirmed | `confirmed` enum `not_checked` / `confirmed` / `rejected` |
| Header discount | `discount_amount` |
| Tenders | `cash_amount`, `cardByCard_amount`, `from_wallet_amount`, `digipay_cashier_amount`, `snappay_cashier_amount` |
| Cancel | `is_cancelled` |
| Soft delete | `deleted_at` |
| Return flag | `return_refund` — **all 0 in this dump; unused** |
| Creator | polymorphic `creatorable_*` (all Admin) |
| Invoice number | no dedicated invoice-number column; `id` / `tracking_code` / `transaction_id` exist |
| Header total | **no `total_amount` column** |

| type | rows |
|---|---|
| sell | 168,663 |
| both | 3,238 |
| refund | 779 |

| confirmed | rows |
|---|---|
| confirmed | 171,563 |
| not_checked | 1,117 |
| rejected | 0 |

`is_cancelled=1`: 861.  
`deleted_at` set: 566.  
`created_at`: **2025-05-31 06:38:02 .. 2026-09-13 07:11:48** (POS appears to start when shop warehouses were created, 2025-05-30/31; Capri store 2025-12-14).

### `mini_order_items` (349,042 rows)

| Concern | Column |
|---|---|
| Header | `mini_order_id` → `mini_orders.id` SET NULL |
| Product | `product_id` → `products.id` |
| Variant | `variety_id` → `varieties.id` — **present on all 349,042 rows** |
| Qty | `quantity` |
| Amount | `amount` |
| Discount | `discount_amount` |
| List/real | `real_amount`, `diff_amount_from_real` |
| Sale vs refund | `type` enum `sell` / `refund` |
| Shop | `store_id` → `stores.id` CASCADE |
| Link to original line | `refrence_mini_order_item_id` (typo in source) |
| Soft delete | `deleted_at` |

| item type | rows |
|---|---|
| sell | 344,458 |
| refund | 4,584 |

`refrence_mini_order_item_id` present: 2,061.  
Item `deleted_at` set: 1,967.

POS chain:

`customers.id` → `mini_orders.customer_id` → `mini_order_items.mini_order_id` → `variety_id` / `product_id` (same catalog as online).

---

## 5. Branch mapping

### How to identify Sari / Gorgan / Capri for every physical sale

**Use `mini_orders.store_id` (and secondarily `mini_order_items.store_id`).**

This is a stored identifier, not a city/address heuristic.

| Sales line | Identifier | `mini_orders` | `mini_order_items` |
|---|---|---|---|
| **SARI** | `store_id = 3` | 102,687 | 220,998 |
| **GORGAN** | `store_id = 2` | 67,248 | 124,335 |
| **CAPRI** | `store_id = 4` | 2,745 | 3,709 |
| Central warehouse | `store_id = 1` | **0** POS headers | — |

102,687 + 67,248 + 2,745 = **172,680**. Every POS header belongs to exactly one of Sari, Gorgan, Capri.

Equivalent lookup via `sell_type_store`: store 2/3/4 = sell_types gorgan/sari/capri.

Do **not** use `pos` (two card terminals) or customer address city as the branch of a sale.

### Canonical sales-line map

| Sales line | Source table | Branch identifier | Customer | Items | Date | Gross / line value | Discount | Returns |
|---|---|---|---|---|---|---|---|---|
| **ONLINE** | `orders` | Table itself (not a store). Optional subchannel `is_shopino`. Central `stores.id=1` is stock, not this sales line. | `orders.customer_id` | `order_items` | `orders.created_at` | `order_items.amount` × qty and/or `orders.total_amount` (definitions differ; see §8) | `order_items.discount_amount` + `orders.discount_amount` | `orders.status` in canceled/failed; item `status`; sparse `canceled_at` |
| **SARI** | `mini_orders` | `store_id=3` | `mini_orders.customer_id` | `mini_order_items` | `mini_orders.created_at` | `mini_order_items.amount` / `real_amount`; tenders on header | item + header `discount_amount` | header `type` refund/both; item `type=refund`; `refrence_mini_order_item_id`; `is_cancelled`; `deleted_at` |
| **GORGAN** | `mini_orders` | `store_id=2` | same | same | same | same | same | same |
| **CAPRI** | `mini_orders` | `store_id=4` | same | same | same | same | same | same |

---

## 6. Product / variant relationships

Shared catalog for **all** sales lines.

```
products
  └── varieties                    # color_id → colors
        └── attribute_variety      # typically size: attributes.id=2
              └── attribute_values

categories
  └── category_product → products
```

| Entity | Table | Key facts |
|---|---|---|
| Product | `products` | 7,369 rows. `title`, `SKU`, `barcode`, `unit_price`, `status`, etc. |
| Variant | `varieties` | 76,097 rows. `product_id` FK CASCADE, `color_id` FK, `price`, `SKU`, `barcode`, `deleted_at` |
| Color | `colors` | 760 rows. `varieties.color_id` present 69,904 / null 6,193 |
| Size | `attributes` id=2 (`size` / سایز) via `attribute_variety` (31,734 rows) → `attribute_values` (124 rows) | Also طرح attributes 1/3/4 |
| Category | `categories` (65) + `category_product` (14,168) | Hierarchical `parent_id` |

**Online items:** `order_items.product_id` + `order_items.variety_id` (variety present 100%).  
**POS items:** `mini_order_items.product_id` + `mini_order_items.variety_id` (variety present 100%).

Same FKs → same `products` / `varieties` masters. Soft-deleted varieties: 14,571 with `deleted_at` set (historical sales may still point at them).

`products.created_at` distribution was not re-extracted with a verified column index in pass 2. `varieties.created_at`: **2022-01-05 .. 2026-09-12**.

---

## 7. Returns / refunds

### Online

No dedicated returns table was found.

| Signal | Reliability |
|---|---|
| `orders.status = canceled` (8,667) or `failed` (18,742) | Primary status model |
| `orders.canceled_at` | **Not reliable** as the cancel detector: only **97** rows populated vs 8,667 canceled |
| `order_items.status = 0` (12,780) | Likely removed/inactive lines; application meaning not proven from schema |
| `order_item_logs.type` (`decrement`/`delete`/…) | Audit, not a return document |
| Payment reversal | Would appear as additional `invoices`/`payments` / wallet `transactions`; **not** a 1:1 return entity |

Do not infer an item-level RMA relationship that is not stored.

### POS

| Signal | Reliability |
|---|---|
| `mini_orders.type = refund` (779) | Header is a refund ticket |
| `mini_orders.type = both` (3,238) | Mixed sell+refund in one ticket |
| `mini_order_items.type = refund` (4,584) | Item-level refund |
| `refrence_mini_order_item_id` (2,061) | Explicit link to original line when present; **not** populated on every refund item |
| `is_cancelled` (861) | Cancelled ticket, distinct from refund type |
| `deleted_at` | Soft-deleted headers (566) / items (1,967) |
| `return_refund` | **Unused** (all 0) |

POS refunds are first-class rows, not only a status on the original sale. Link-back to the original line exists only when `refrence_mini_order_item_id` is set.

---

## 8. Payment / invoice relationships

### Online (and wallet top-up)

```
orders.id  ──payable──►  invoices (payable_type = Modules\Order\Entities\Order)
deposits.id ──payable──►  invoices (payable_type = Modules\Customer\Entities\Deposit)
invoices.id ──────────►  payments
```

| invoices.payable_type | rows |
|---|---|
| `Modules\Order\Entities\Order` | 539,278 |
| `Modules\Customer\Entities\Deposit` | 11,788 |

No invoice `payable_type` for MiniOrder / POS was observed. **POS does not use `invoices`.**

| invoices.status | rows |
|---|---|
| success | 251,584 |
| pending | 237,283 |
| failed | 62,199 |

`invoices.type`: gateway 510,220 / wallet 35,904 / both 4,942.

`payments` (488,814): **no amount column**. Amount lives on `invoices`. Payment status in dump: pending 272,944 / success 215,870 (no `failed` rows counted). Gateways observed: digipay, zarinpal, saman, snapppay, parsian, digikala, pasargad, virtual.

`deposits` (11,797) → wallet top-up, `customer_id` → `customers`.  
`wallets` (306,878) holder is typically a customer.  
`transactions` (250,765) polymorphic wallet ledger.

### POS tenders

On `mini_orders` only: cash, card-by-card, wallet, Digipay cashier, Snappay cashier. Related request tables (`digipay_cashier_requests`, `snappay_cashier_requests`) are operational, not the sale document.

### Implication for sales reporting

Order history can be reconstructed from `orders`/`order_items` and `mini_orders`/`mini_order_items` **without** invoices. Invoices are required if the definition of “sale” is “successfully collected payment,” because many invoices are pending/failed retries. POS has no invoices, so a payment-table definition cannot be applied uniformly.

---

## 9. Data volumes / date ranges

Counts are streaming tuple counts from `INSERT` data.

| Table | Rows | Date range (`created_at`) |
|---|---|---|
| customers | 270,728 | 2022-01-06 .. 2026-09-13 |
| addresses | 219,700 | (not ranged) |
| orders (online) | 297,095 | 2022-01-12 .. 2026-09-13 |
| order_items | 730,623 | |
| mini_orders (POS) | 172,680 | 2025-05-31 .. 2026-09-13 |
| mini_order_items | 349,042 | |
| products | 7,369 | (not verified in pass 2) |
| varieties | 76,097 | 2022-01-05 .. 2026-09-12 |
| invoices | 551,066 | 2022-01-12 .. 2026-09-13 |
| payments | 488,814 | |
| colors | 760 | |
| categories | 65 | |
| wallets | 306,878 | |
| store_items | 145,886 | |
| store_item_transactions | 1,913,839 | |
| store_transfers | 9,119 | |

### POS by branch (`mini_orders.store_id`)

| Branch | store_id | Orders |
|---|---|---|
| Sari | 3 | 102,687 |
| Gorgan | 2 | 67,248 |
| Capri | 4 | 2,745 |

AUTO_INCREMENT values (e.g. orders `AUTO_INCREMENT=569524` vs 297,095 rows) are **not** row counts. Historical deletes/gaps exist.

---

## 10. Required-now tables

Needed for sales reports, product sales, customer reports, Customer 360. Lookups included only where reports would otherwise show raw IDs.

| Table | Why |
|---|---|
| `customers` | Shared identity |
| `addresses` | Customer 360 |
| `cities`, `provinces` | Address labels |
| `orders` | Online sales |
| `order_items` | Online lines |
| `mini_orders` | POS sales |
| `mini_order_items` | POS lines |
| `products` | Product reporting |
| `varieties` | Variant/size/color reporting |
| `colors` | Color |
| `attributes`, `attribute_values`, `attribute_variety` | Size (and طرح) |
| `categories`, `category_product` | Product taxonomy |
| `stores` | Map POS `store_id` → Sari/Gorgan/Capri **labels** (not inventory qty) |
| `sell_types`, `sell_type_store` | Canonical POS sales-line names |
| `shippings` | Online shipping method label (small lookup) |
| `levels`, `customer_roles` | Club/VIP on 360 (sparse but on the customer row) |

`invoices` / `payments` are **not** in this list for the initial sales reconstruction (see §8 and §12).

---

## 11. Useful-later tables

| Area | Tables |
|---|---|
| Payments / finance | `invoices`, `payments`, `gateways`, `virtual_gateways`, `deposits`, `wallets`, `transactions`, `withdraws` |
| POS tenders / BNPL ops | `digipay_cashier_requests`, `digipay_requests`, `digipay_link_views`, `snappay_cashier_requests`, `pos`, `admin_pos` |
| POS staff | `admins` (cashier = `mini_orders.creatorable_id`) |
| Loyalty / club | `physical_scores`, `physical_wallets`, `prizes`, `gifts`, `gift_order_item`, `gift_product_variety` |
| Coupons / campaigns | `coupons`, `coupon_customer`, `specific_discounts`, `specific_discount_items`, `specific_discount_types`, `flashes`, `flash_product`, `recommendations`, `favorites` |
| Inventory / warehouse | `store_items`, `store_item_transactions`, `store_transfers`, `store_transfer_items`, `store_transactions`, `store_tracking_logs`, `stores_2`, `product_stocktakings`, `transfers` |
| Procurement | `suppliers`, `brands` |
| Deeper order audit | `order_logs`, `order_item_logs`, `order_status_logs` |
| Product merchandising | `size_charts`, `size_chart_types`, `size_chart_type_values`, `specifications`, `specification_values`, `product_specification*`, `product_sets`, `product_set_product`, `units`, `media`, `tags`, `taggables` |
| Abandoned cart / CRM | `carts`, `cart_reports`, `cart_report_items`, `newsletters`, `users_newsletters`, `customer_actions` |
| Settings | `settings`, `sellers` |

Do not import inventory tables for current sales/customer analytics. `store_item_transactions` can *join* a sale to a warehouse decrement, but that is stock location, not sales line.

---

## 12. Not-needed-currently tables

Unrelated to current ELINOR IQ v2 scope (sales history, product sales, customer reports, Customer 360):

`actions`, `activity_log`, `advertisement_positions`, `advertisements`, `agencies`, `announcements`, `attribute_category`, `brand_category`, `comments`, `contacts`, `customer_role_shipping`, `f_a_q_categories`, `f_a_qs`, `failed_jobs`, `group_charges`, `instagram_posts`, `jobs`, `listen_charges`, `menu_groups`, `menu_items`, `migrations`, `model_has_permissions`, `model_has_roles`, `model_views`, `notifications`, `pages`, `password_resets`, `permissions`, `personal_access_tokens`, `popups`, `post_categories`, `posts`, `product_comments`, `role_has_permissions`, `roles`, `shipping_excels`, `shippables`, `site_views`, `sliders`, `sms_tokens`, `stories`, `support_request_answers`, `support_requests`, `views`, `z_trash_cities2`.

---

## 13. Proposed ELINOR IQ v2 target model

The minimal model in the brief is enough, with one explicit sales-line enum and one stock-location lookup that is **not** a sales fact.

```
Customer
CustomerAddress

Product
Variant
  Color
  SizeAttribute (from attribute_variety where attribute = size)
Category

SalesLine          # ONLINE | SARI | GORGAN | CAPRI
StoreLocation      # lookup only: 1 central, 2 Gorgan, 3 Sari, 4 Capri

OnlineOrder        # from orders
OnlineOrderItem    # from order_items

PosSale            # from mini_orders
PosSaleItem        # from mini_order_items

# Later, optional:
Invoice            # online/deposit only
Payment            # online gateways only; no amount; POS tenders stay on PosSale
```

**Do not** split Customer by branch.  
**Do not** treat `stores.id=1` as Online.  
**Do not** put POS into `OnlineOrder`.  
Shopino is a flag/subchannel on `OnlineOrder`, not a fifth sales line unless product later asks for it.

Django models were **not** modified in this phase.

---

## 14. Data-quality issues

1. **Incomplete customer profiles:** ~39% missing first name; almost no gender/email/birth; national code sparse.
2. **Customers without purchases:** 68,663 registry rows with no `orders` or `mini_orders`.
3. **Guest online orders:** 178 null `customer_id`.
4. **Mobile uniqueness is column UNIQUE, not semantic uniqueness:** 29 non-11-digit values, 2 non-digit. Empty mobile is impossible; garbage mobiles are possible.
5. **VIP/role_id=3 orphan:** one customer references a role not present in `customer_roles` dump (only VIP id=2).
6. **Club levels mostly NULL** despite `levels` existing (introduced 2026-08).
7. **Online cancel timestamp sparse** (`canceled_at` vs `status`).
8. **Invoices are not sales:** hundreds of thousands of pending/failed payment attempts. Using invoice rows as revenue would double-count and mix unpaid attempts.
9. **POS header has no total_amount;** tenders can be zero on mixed `type=both` tickets (first row sample).
10. **`return_refund` unused;** refund detection must use `type` + item `type` + optional reference id.
11. **Soft deletes** on POS headers/items and varieties: import rules must decide whether to include `deleted_at` rows.
12. **POS history starts 2025-05-31**; online from 2022-01. Pre-2025 physical sales are not in `mini_orders` in this dump.
13. **Capri volume is small** and late (store created 2025-12-14).
14. **`order_items.status` and amount semantics** (unit vs line) are not proven from schema.
15. **Dump AUTO_INCREMENT >> live row counts** (e.g. orders, order_items): deleted/missing history.
16. **Gateway/admin secrets** exist in the SQL file; they must never be imported into v2.

---

## 15. Unresolved questions

1. Exact application meaning of `order_items.status` 0 vs 1, and whether `amount` is unit or line total.
2. How `orders.total_amount` is computed vs sum of items − discounts + shipping (not verified by recomputation).
3. How `mini_orders` header tenders reconcile to item `amount` / `real_amount` / header `discount_amount`.
4. Whether `mini_orders.confirmed='not_checked'` should be excluded from sales reports.
5. Whether `type='both'` should split into sell lines vs refund lines only via items.
6. Why `refrence_mini_order_item_id` is missing on some refund items (4,584 refund items vs 2,061 references).
7. Whether Shopino (`is_shopino`) should be a subchannel of Online in v2 UI.
8. Identity of the 178 guest orders and the 5 `status=0` customers.
9. Whether any `customers` rows are staff/test (not schema-provable).
10. What physical sales existed before 2025-05-31, if any, outside this dump.
11. `products.status` distribution (pass 2 column index for product status/`created_at` was not trusted).
12. `payments` has no `failed` rows in this dump despite the enum — confirm if failures are only on `invoices`.

These do not block mapping. They block **revenue definition** and some filter defaults.

---

## Relationship diagram (actual names)

```
customers
├── addresses
│     └── cities → provinces
├── orders                          # ONLINE sales line
│     ├── order_items
│     │     ├── products
│     │     └── varieties → colors
│     │           └── attribute_variety → attribute_values   # size
│     ├── shippings
│     ├── coupons
│     └── invoices (payable_type = Order)
│           └── payments            # gateway; amount is on invoices
│
└── mini_orders                     # POS sales
      └── mini_order_items
            ├── products            # SAME products
            └── varieties           # SAME varieties
                  └── (color / size as above)

sell_types (gorgan, sari, capri)
  └── sell_type_store
        └── stores
              ├── 1 انبار مرکزی          # stock only, not a sales line
              ├── 2 انبار فروشگاه گرگان  # GORGAN POS = mini_orders.store_id
              ├── 3 انبار فروشگاه ساری   # SARI POS
              └── 4 انبار کاپری          # CAPRI POS

store_items / store_item_transactions / store_transfers
  └── inventory (out of current import scope)
```

---

## Business questions (explicit answers)

1. **Are customers shared across Online/Sari/Gorgan/Capri?**  
   **Yes.** One `customers` table. Online and all POS FKs use `customers.id`. 6,505 customers appear in both channels.

2. **What field/table tells whether a POS sale is Sari, Gorgan, or Capri?**  
   **`mini_orders.store_id`:** 3 = Sari, 2 = Gorgan, 4 = Capri. Confirmed by `stores` labels and `sell_type_store`. Item-level `mini_order_items.store_id` matches.

3. **Is Online structurally separate from POS?**  
   **Yes.** `orders`/`order_items` vs `mini_orders`/`mini_order_items`. Online has no `store_id`.

4. **Do Online and POS share Product/Variant master?**  
   **Yes.** Both item tables FK to `products.id` and `varieties.id`. Variety is populated on every item row counted.

5. **Can one customer have sales across branches/channels with the same `customer_id`?**  
   **Yes.** Proven by 6,505 customers with both online and POS rows. POS `store_id` can differ per sale for the same customer (not separately counted per pair in this pass, but the schema allows it and the shared FK is proven).

6. **What is required to reconstruct complete sales history?**  
   `customers`, `orders`, `order_items`, `mini_orders`, `mini_order_items`, `products`, `varieties`, plus `stores`/`sell_types` for POS labels. Filters must define how to treat canceled/failed/refund/deleted/`not_checked`.

7. **Can inventory tables be ignored for current scope?**  
   **Yes** for import. Understand `stores` as labels + stock locations. Do not import `store_items` / transactions / transfers unless warehouse analytics start.

8. **Are invoice/payment tables required for accurate sales reporting?**  
   **Initially optional.** They are online (and deposit) payment attempts, not POS, and are not 1:1 with delivered orders. Use them later for collection/gateway analytics. POS money is on `mini_orders` tender columns.

9. **What is required for Customer 360?**  
   The shared `customers` row + addresses + all `orders` and `mini_orders` (and items) for that `id`, with sales line derived as Online vs `store_id` 2/3/4, plus product/variant names from the shared catalog. Levels/VIP if desired.

10. **Biggest data-quality risks?**  
    Incomplete names; large never-purchased registry; unpaid/failed online statuses mixed with delivered; invoice pending noise if mistaken for revenue; POS refund/`both`/cancel/soft-delete overlap; amount-field ambiguity; POS only since 2025-05-31; secrets in dump.

---

*End of discovery. No import performed.*
