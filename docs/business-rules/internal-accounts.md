# Internal Accounts — Business Rules

Source of truth in code: `backend/apps/customers/operators.py` (exclusion helpers), `models.py` (`InternalAccount`),
`internal_accounts.py` (confirm/restore), `rfm.py` (detection signals). Decision: [[decisions/0004-internal-accounts]].

## 1. Definition
An internal account is a customer account used by the desk («اکانت دفتر») or by staff («کارمند») to place orders
for other people. Such accounts look like top customers but are not real buyers.

- Source of truth: active rows of `customer_internal_accounts` (`InternalAccount`: kind `desk` | `staff`, note,
  is_active, created/updated by and at).
- The former hard-coded desk mobile (`OPERATOR_MOBILES`) was moved into the table by migration 0008
  (an active `desk` row). `canonical_mobile()` remains as a helper; mobiles no longer drive exclusion.

## 2. Exclusion scope (identical for desk and staff)
| Area | Effect |
|---|---|
| Loyalty tiers | `tier_code` NULL; cleared with tier history |
| RFM | no `customer_rfm` row, no snapshots |
| Customer list ranking | visible with the kind badge, ranked last |
| Buyer counts | excluded in `sales/analysis.py`, `core/views.py`, `system/views.py`, customer reports |
| Sales totals | **unchanged**: revenue and order counts keep their orders |
| Campaign customer reports | `campaigns.py` is not changed; it filters by `tier_code`, and internal accounts have no tier |

Exclusion uses customer ids (`c.id <> ALL(...)` in the facts CTE), not mobiles.

## 3. Detection signals (flags only; nothing is excluded automatically)
Computed in the RFM refresh for purchasing, non-excluded customers and stored on `customer_rfm`
(`internal_signal_score`, `internal_signals`). Each fired signal adds 1 point. Constants: `INTERNAL_SIGNAL_THRESHOLDS`.

| Signal | Fires when | Persian text |
|---|---|---|
| high_frequency | purchase_count_12m ≥ 99.5th percentile of purchasing customers (and > 0) | «N خرید در ۱۲ ماه» |
| many_receivers | ≥ 5 distinct online receiver names other than the account holder | «N گیرنده‌ی مختلف» |
| many_cities | ≥ 3 distinct online receiver cities | «ارسال به N شهر» |
| same_day_burst | ≥ 3 purchases on one local day (qualifying online + POS sell) | «N خرید در یک روز» |
| many_branches | ≥ 3 distinct POS sales lines (sells) | «خرید از N شعبه» |

- Names compare after trimming, collapsing spaces, unifying ي/ی and ك/ک, case-insensitive. Receiver name =
  `receiver_first_name + receiver_last_name`, falling back to `receiver`.
- **Suspected** = score ≥ 3 (`SUSPECTED_MIN_SCORE`, raised from 2 by the owner on 2026-10-25) and not an active internal account.

## 4. Confirm and restore (super admin only)
- Customer 360 shows a yellow banner with the fired signals for suspected accounts, and the header menu (⋯) always
  offers «علامت‌گذاری به‌عنوان حساب داخلی» (kind + note).
- A confirmed account shows a neutral banner with kind, note, who/when and «بازگرداندن به گزارش‌ها» (is_active = false).
- The customer list drawer has «حساب‌های داخلی» (مشکوک / تأییدشده / همه); suspected rows show «مشکوک».
- API: `GET|POST /api/customers/internal-accounts/`, `PATCH /api/customers/internal-accounts/<id>/` (no DELETE).
- Every create, activation or deactivation starts the background tier refresh, which also refreshes RFM.
  If a refresh is already running, the change takes effect on the next run (the API returns `refresh_started`).

## 5. Confirmed accounts
- On 1405/08/04 the owner reviewed the accounts with the most invoices and confirmed **15 internal accounts:
  6 staff («کارمند») and 9 desk («اکانت دفتر»)**, one of which is the desk account already moved by migration 0008.
- The list (by `Customer.source_id`) lives in migration `0009_seed_confirmed_internal_accounts` and in the
  `customer_internal_accounts` table. 0009 is idempotent, skips customers that do not exist, keeps pre-existing rows
  (reactivates them and sets the kind, without changing their note), and its reverse deletes only the rows it created.
- Past `customer_rfm_snapshots` rows of these accounts are kept as history and excluded when read (movement report).
- After the migration run the full refresh: `manage.py refresh_customer_tiers --force` (tiers, then RFM and signals).

