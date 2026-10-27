# Customers overview metrics (Customers page, list tab)

Status: implemented on `feature/customers-overview` (2026-10-28), not released. Design reference:
`docs/design/customers-overview-v3.html` (prototype v3; its numbers are sample data).
Source: `backend/apps/customers/overview.py`, `GET /api/customers/overview/`; UI `features/customers/CustomerOverview.tsx`.

## Purchases

- Every purchase comes from `apps/sales/semantics.py`: `qualifying_online_orders()` (online),
  `qualifying_pos_sales()` (POS `sell`/`both`, not cancelled, not deleted), `qualifying_online_gateway_payments()`.
- A **qualifying invoice** = one qualifying online order or one qualifying POS sale.
- **Amount** = online `total_amount` + signed POS item lines per sale, exactly as the tier facts
  (`tiers._signed_line_sql`): `sell` lines +, refund lines of `both`/`refund` headers −. POS `refund` headers
  (not cancelled) add their negative amount to the net sales of their channel but are not invoices or purchases.
- Unit: Toman, as stored. Basket is shown in thousand Toman (value / 1000, rounded). Average = `int(round())`
  like `sales.kpis` `avg_order_amount`.
- Internal accounts (`operators.py`) are excluded from every figure, including tiers.

## Lenses

| Lens | Purchases |
|---|---|
| همه الینور (`total`) | union of all lenses |
| سایت (`site`) | all qualifying online orders |
| ساری / گرگان / کاپری | qualifying POS sales by `sales_line` |
| شاپینو (`shopino`) | online orders with `is_shopino = True` |
| اسنپ‌پی (`snappay`) | POS sales with `snappay_cashier_amount > 0`, or online orders with a successful `snapppay` gateway payment |
| دیجی‌پی (`digipay`) | POS sales with `digipay_cashier_amount > 0`, or online orders with a successful `digipay` gateway payment |

One customer can be in several lenses. For payment lenses the basket uses the full invoice amount of those invoices.

## Windows (Asia/Tehran, today included)

- `30` / `90`: the last N days. `month`: 1st of the current Jalali month to today. `365`: the last 365 days.
- `prev`: the equal-length window right before. `yoy`: the same Jalali dates one year earlier
  (Esfand 30 → Esfand 29).
- Sparkline (12 points, oldest left): `30`/`90` = 12 consecutive windows of that length ending today;
  `month`/`365` = the last 12 Jalali months (the current month to date is the last point).

## Metrics (per lens)

- **کل مشتریان**: distinct customers with ≥ 1 qualifying invoice ever in the lens. Sub-line «+N جدید» = customers
  whose first invoice in that lens falls inside the window.
- **خریداران فعال**: distinct customers with ≥ 1 qualifying invoice in the window.
- **میانگین سبد خرید**: amount / qualifying invoices in the window.
- **نرخ خرید مجدد**: % of active customers whose first qualifying invoice (any channel) is before the window start.
- **Delta**: % change vs the compare window, 1 decimal; repeat rate in percentage points («واحد»).
  Null when the previous value is 0 or missing.

## Data coverage

- Data start per lens: `site`, `shopino` = 2022-01-12 (online history); every lens that includes POS
  (`total`, branches, `snappay`, `digipay`) = 2025-05-31.
- A window or sparkline bucket that starts before its lens's data start returns `null`. The UI shows «—» with the
  title «داده مقایسه کافی نیست», and the sparkline has a gap. Nothing is extrapolated.

## Tiers

- Counts = customers per stored `tier_code` now (internal accounts excluded). Titles, codes and order come from the
  active rule set: one panel per channel («حضوری», «اینترنتی») for channel rules, one panel «همه» for legacy rules.
- Net delta per tier = entries − exits in the current window from `CustomerTierHistory`
  (entry: `tier_code` = T; exit: `previous_tier_code` = T).
- `rules_changed` = a rule set was activated inside the window; the UI adds «قوانین سطح در این بازه تغییر کرده است.»
  Then the deltas include the activation's re-tiering.

## Insights

Largest and smallest active-buyer delta among the 7 non-total lenses (nulls skipped), and the tier with the largest
positive net delta. A missing item is not shown.

## Known gap

`کل مشتریان` (all lenses) counts qualifying invoices only; `reports.populations.purchasing_customers` counts
`Customer.order_count > 0`. On local data (2026-10-28): 199,732 vs 204,266 (gap 4,534; not investigated).

## Caching

Per process (Django default local-memory cache), key = (period, compare, today), 15 minutes.
Lens and focused card switch on the client without a request.
