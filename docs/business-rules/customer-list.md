# Customers list (Customers page, list tab)

Status: implemented on `feature/customer-list-redesign` (2026-11-02), not released. Reference: `docs/design/customer-list-prototype.html` (sample data). Source: `apps/customers/list_query.py`, `metrics.py`; `features/customers/CustomerListPanel.tsx`, `customerListUrl.ts`.

## CustomerMetrics (one row per customer, internal accounts included)
- `invoice_count`: qualifying online orders + qualifying POS sales (`semantics.py`). POS `sell` and `both` count. The tier engine's purchase count takes POS `sell` only, so the two can differ.
- `total_amount`: online `total_amount` + signed POS item lines, including refund headers; equals the tier engine's lifetime amount.
- `avg_basket`: `total_amount / invoice_count`, rounded; null with zero invoices.
- `first_purchase_at`, `last_purchase_at`, `channel` (`online`, `physical`, `both`, `none`).
- Filter facts: `lines`, `payments` (snappay, digipay, shopino), `has_discount`, `sizes` (upper case), `categories` (exact product category titles), `cities` (address city and order receiver city, trimmed).
- Refresh: one SQL statement after the daily tier pass, and `refresh_customer_metrics` (the scheduler runs `--if-empty` for the first fill). Idempotent; only changed rows are written, so `refreshed_at` is when the row last changed. Figures are up to a day old; a customer added since the last refresh has no row and shows «—».

## Two parameter sets
Requests with `dir` are the redesigned list: sort on metrics, internal accounts excluded unless searching (so one can still be found by name). Requests without `dir` behave as before, which keeps saved `CallList.filter_params` returning the same customers.
- New, on metrics: `min_invoices, max_invoices, min_total, max_total, min_avg_basket, max_avg_basket, channels, branches, payments, discount, sizes, categories, cities, last_days, first_days (30, 90, gt90, gt180), last_after, last_before, first_after, first_before`.
- New, on call tables: `call_result` (`none` = no call), `call_tag` (open tags), `do_not_call` (yes, no).
- Old names (`channel, sales_lines, payment_method, has_discount, size, category, city, min_amount, min_purchases, last_from...`) keep their old query. `tier`, `size`, `category`, `city`, `payment_method` also accept comma lists.
- `categories` matches exact category titles, while old `category` also matched product titles, so counts differ (local «مانتو»: 14,262 vs 18,584).
- `ids`: selected source ids, for export.
- The panel sets dates only through `last_after/before` and `first_after/before` (inclusive Tehran days). `last_days`/`first_days` come from presets, old URLs, saved views and call lists, and stay rolling.

## Filter v2 (2026-11-03)
- `provinces`, `city_ids` (ids, from addresses linked to the synced City table; customers without a linked address never match). Options: active Province/City rows with customer counts from metrics (internal accounts excluded), zero last, cached for the day. `cities` (names) still works.
- `products` (ids): qualifying online and POS items. `list-products/?q=` returns the top 20 title matches (two characters minimum); `?ids=` returns titles for chips.
- `birth_months` (Jalali 1-12): synced birth dates are Jalali values stored in a date column (year 13xx), so their month is used as is; Gregorian dates are converted.
- `genders`, `joined_after`/`joined_before` (`created_at_source`).
- `tier_change=up|down` with `tier_change_after`/`tier_change_before`: a change in `CustomerTierHistory` to a higher (lower) tier by the active rule order; no tier ranks lowest, so entering a tier is up and losing one is down.
- `list-options` returns fill rates; the panel hides a filter whose data covers under 5% of customers.

## Summary and sorting
- `list-summary/`: count, total amount, basket = total / invoices, average invoice count, share of all customers, overall baselines (internal accounts excluded). Cached 5 minutes per (filters, day).
- Averages cover everyone in the result, customers with no purchase included.
- Sortable: name, tier (active rule order), avg_basket, invoice_count, total_amount, last_purchase, first_purchase. Empty values always sort last.
- The list shows all customers, also those with no purchase, as before.

## Saved views
`CustomerListView`: per user, unique name per user. Filters only, no sort.

## «تغییر سطح» (tier change) filter and the Home tier-drop item (2026-11-13)
- Counts only natural changes from `CustomerTierHistory`: reason `daily` or `sync`. Activation, baseline, manual and
  internal-account rows are rule or admin changes and never count.
- Up and down compare ranks within one channel only (`previous_channel` equals `channel`; both empty = non-channel rules).
  A channel switch is neither up nor down. A move to no tier is not a drop; entering a tier from none counts as up.
- Local check (2026-11-13, last 30 days): drops 14,482 → 14,468; rises 2,663. Almost all were real daily-pass moves (about
  850 a day, one spike of 5,375 on 2026-11-02), likely inflated locally by missing recent online details.
