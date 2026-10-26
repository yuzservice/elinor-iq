# Customer RFM — Business Rules

Source of truth in code: `backend/apps/customers/rfm.py` (thresholds, segments, refresh, snapshots, summary),
facts from `apps/customers/tiers.py` (`_facts_sql`). Decision: [[decisions/0003-rfm-report-and-club-menu]].

RFM is a **separate analytical layer**. It is independent of loyalty tiers ([[business-rules/customer-tiers]]) and
does not read or change tier logic, tier rules or `campaigns.py`.

## 1. Facts (shared with tiers, not forked)
| Fact | Definition |
|---|---|
| R basis: `days_since_last_purchase` | Reference date (Asia/Tehran) − local date of the latest qualifying online order or POS sell. Full history. |
| F basis: `purchase_count` | Online orders not in `canceled`, `failed`, `wait_for_payment` + POS sales `type='sell'` (not deleted, not cancelled). Full history. |
| M basis: `lifetime_purchase_amount` | Online `total_amount` + signed POS item lines (sell +, exchange sell +, exchange/refund refund −). Full history. |
| `purchase_count_12m`, `amount_12m` | Same rules, purchases whose local date is in the 365 days up to the reference date. Context only; not used in scores. |

- Internal accounts (desk and staff, [[business-rules/internal-accounts]]) are excluded by customer id. Customers with no purchase get **no RFM** and are reported as «ثبت‌نام بدون خرید». The report footer shows how many internal accounts are excluded.
- The refresh also scores internal-account detection signals on each row (`internal_signal_score`, `internal_signals`); see the internal-accounts rules.
- `rfm_facts_sql(as_of)` adds the 12-month columns and, with `as_of`, counts only purchases with local date ≤ as_of and
  measures days from as_of (used for monthly snapshots). With as_of = today it equals the tier facts (tested).
- **Exchange counting:** POS exchanges (`both`) are not purchases in F; their sell and refund lines only change M.
- **Label:** amounts are «خرید خالص مشتری» (customer net purchase), never «فروش». This is not the sales revenue of
  `apps/sales/semantics.py` and must never be mixed into sales reports.
- **Coverage:** online history from 2022-01-12 (1400/10/22), POS history from 2025-05-31 (1404/03/10). F and M are
  understated for customers who bought in store before POS history begins.

## 2. Scores (fixed constants, provisional)
| Score | R: days since last purchase | F: purchases | M: net purchase (toman, same units as stored) |
|---|---|---|---|
| 5 | ≤ 30 (incl. negative) | ≥ 6 | ≥ 20,000,000 |
| 4 | 31–90 | 4–5 | 10,000,000 – 19,999,999 |
| 3 | 91–180 | 3 | 5,000,000 – 9,999,999 |
| 2 | 181–365 | 2 | 2,000,000 – 4,999,999 |
| 1 | > 365 | 1 | < 2,000,000 (incl. ≤ 0) |

Thresholds are constants in `rfm.py` (`R_MAX_DAYS`, `F_MIN_COUNT`, `M_MIN_AMOUNT`); they are not user-configurable.

## 3. Segments (from R and F; every cell maps to exactly one)
| key | Persian | cells | recommended action |
|---|---|---|---|
| champions | قهرمانان | R5F5, R5F4, R4F5 | قدردانی و دسترسی زودتر به کالکشن جدید |
| loyal | وفاداران | R4F4, R3F4, R3F5 | حفظ رابطه با پیشنهاد شخصی |
| potential | وفادار بالقوه | R5F3, R5F2, R4F3, R4F2 | تشویق به خرید بعدی |
| new | تازه‌واردها | R5F1, R4F1 | خوش‌آمد و تشویق به خرید دوم |
| attention | نیازمند توجه | R3F3, R3F2, R3F1 | یادآوری و معرفی کالای جدید |
| at_risk | در خطر | R2F4, R2F3, R1F4, R1F3 | تماس یا هدیه بازگشت |
| cant_lose | نباید از دست برود | R2F5, R1F5 | تماس شخصی مدیر فروشگاه |
| hibernating | خواب / از دست رفته | R2F2, R2F1, R1F2, R1F1 | کمپین فصلی کم‌هزینه |

M is not part of the segment. M ≥ 4 shows the «پرارزش» flag and is used for sorting (`sort=rfm`: segment order, then M).

## 4. Storage and refresh
- `customer_rfm`: one row per purchasing, non-operator customer. Rebuilt by a set-based upsert right after the tier
  refresh (daily and manual `POST /api/customers/refresh-tiers/`); rows of customers who no longer qualify are deleted.
  Status in `SyncCursor` key `customer_rfm` (computed_at, error, last snapshot). `manage.py refresh_customer_tiers --force`
  also refreshes RFM (since 2026-10-25).
- `customer_rfm_snapshots`: month key = Jalali year-month (e.g. "1405-07") = RFM at the **end** of that month
  (as_of = its last day). On the first refresh of a new Jalali month the month that just ended is written. Idempotent.
- `manage.py backfill_rfm_snapshots --months 12` builds past months; existing months are skipped.

## 5. Report definitions (Stage 1b, `apps/customers/rfm_reports.py`)
Population filters reuse the customer list filters: `sales_line` (online, sari, gorgan, capri) and `payment_method`
(`snappay`, `digipay`, `other` = purchasers who never paid with SnappPay or DigiPay, i.e. not `installment`).
Active internal accounts are excluded everywhere, including when reading past snapshots.

### Stored per customer (`customer_rfm`, migration 0010)
- Purchase events = qualifying online orders + POS `sell` (the purchase_count basis).
- `first_purchase_at`, `second_purchase_at`: first and second event (window functions in the refresh).
- `avg_interval_days` = (local date of last − local date of first) ÷ (purchase_count − 1); NULL with one purchase.
- `is_overdue` = purchase_count ≥ 2 **and** avg_interval_days > 0 **and** days_since_last_purchase > 1.5 × avg_interval_days.
  Two or more purchases on one day only (interval 0) are never overdue. «روز تأخیر» = days since last − avg interval.

### KPIs (`GET /api/customers/rfm/summary/`)
Each KPI has `value`, `previous` (latest monthly snapshot), `delta_pct` and a 12-month `trend` (oldest first).
| KPI | Definition | Secondary |
|---|---|---|
| buyers_30d | customers with a purchase in the last 30 days (days since last < 30) | purchases in those 30 days |
| active_customers_12m | purchase_count_12m ≥ 1 | repeat rate (≥ 2 purchases in 12 months ÷ active) |
| second_purchase_90d | of customers whose first purchase was 90–455 days ago, % with a second purchase ≤ 90 days after the first | cohort size |
| value_at_risk | lifetime net purchase of `at_risk` + `cant_lose` | their customer count |

Snapshot months written before migration 0010 have no facts until `backfill_rfm_snapshots --rebuild`; their trend
points are empty.

### Segments, composition, matrix
- Segments are returned in fixed **action priority**: cant_lose, at_risk, new, potential, attention, champions, loyal,
  hibernating, with `overdue_count` and the change in count vs the latest snapshot month.
- Composition: share of customers and share of net purchase per segment (two stacked bars).
- Matrix cells carry count, shares, net purchase, 12-month amount, high-value count, average days and Persian range
  labels; axis labels are built from the threshold constants.

### Second purchase and reactivation
- Funnel: first-purchase cohort of the last 365 days; for 30/60/90/180 days, % reaching a second purchase, counted only
  over customers whose first purchase is at least that old. Median days to second purchase among those with one.
  POS history starts 1404/03/10, so in-store second purchases before that are not visible.
- Reactivated: latest purchase in the last 30 days and the purchase day before it ≥ 180 days earlier (distinct days).
  Reported with their net purchase in those 30 days, and the same figure for the previous 30 days.

### Movement (`GET /api/customers/rfm/movement/?months=1|3|6|12`)
Latest snapshot vs the snapshot k months earlier. Value rank (high → low): champions, loyal, potential, new, attention,
cant_lose, at_risk, hibernating. Per segment: start count, stayed %, improved (moved to a higher rank), declined (lower
rank), entered, exited, net; plus top 10 moves and new purchasers. Null with a Persian reason when a snapshot is missing.

### Call list (`GET /api/customers/rfm/call-list/`)
Customers with `is_overdue` and last purchase ≤ 365 days ago, ordered by lifetime net purchase. Filters: segment,
sales_line, payment_method. CSV: `GET /api/customers/export/?call_list=1` (same filters).

### Export log
Every customer CSV export (list and call list) is logged by the `apps.customers.exports` logger: user, filters, row
count and time (application log; no table). Export permission is unchanged (signed-in users).

### Performance note
The report queries run with `SET LOCAL max_parallel_workers_per_gather = 0` and a per-request temporary table for the
filtered population. With parallel plans some queries stalled or failed with «could not resize shared memory segment»
(Postgres container `/dev/shm` is the 64 MB Docker default).
