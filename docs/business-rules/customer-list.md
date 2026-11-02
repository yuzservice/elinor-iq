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

## Summary and sorting
- `list-summary/`: count, total amount, basket = total / invoices, average invoice count, share of all customers, overall baselines (internal accounts excluded). Cached 5 minutes per (filters, day).
- Averages cover everyone in the result, customers with no purchase included.
- Sortable: name, tier (active rule order), avg_basket, invoice_count, total_amount, last_purchase, first_purchase. Empty values always sort last.
- The list shows all customers, also those with no purchase, as before.

## Saved views
`CustomerListView`: per user, unique name per user. Filters only, no sort.
