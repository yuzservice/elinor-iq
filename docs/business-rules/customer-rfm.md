# Customer RFM — Business Rules

> **Reverted 2026-10-27 — see archive branch `archive/rfm-club-2026-10-27` (`4a69c5d`) and [[decisions/0005-revert-rfm-club]].**
> Nothing below is in the code on `main` or `production`. Kept for reference only.

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

## 5. Report definitions (`GET /api/customers/rfm/summary/`)
- Population filters reuse the customer list filters: `sales_line` (online, sari, gorgan, capri) and `payment_method`
  (`snappay`, `digipay`, `other` = purchasers who never paid with SnappPay or DigiPay, i.e. not `installment`).
- `active_customers_12m`: purchase_count_12m ≥ 1. `repeat_rate_12m`: purchase_count_12m ≥ 2 ÷ active.
  `avg_amount_12m_per_active`: amount_12m of active ÷ active. `value_at_risk`: lifetime amount of `at_risk` + `cant_lose`.
- Movement: latest snapshot month vs the previous one, top 10 segment changes, plus purchasers new in the latest month.
  Null with fewer than 2 snapshots.
