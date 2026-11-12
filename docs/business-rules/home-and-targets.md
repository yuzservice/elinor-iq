# Home page and sales targets

Status: implemented on `feature/home-redesign` (2026-11-13), not merged; owner reviews locally. Reference:
`docs/design/home-prototype.html` (sample data). Source: `apps/core/home.py`, `apps/core/views.py`, `apps/core/home_cache.py`,
`apps/sales/targets.py`; `pages/HomePage.tsx`, `features/home/`. Decision: [[0009-home-and-sales-targets]].

## Figures (all from `apps/sales/semantics.py`)
- **Sales** = online order value (`online_order_value_orders`, `Order.total_amount`) + in-store sold lines
  (`qualifying_pos_items`, amount × quantity). The channels are computed apart and only added; POS tenders are never used.
  This is the home revenue card and the sales-target metric.
- **Invoices** = qualifying online orders + qualifying POS sales (as on the Sales page). **Average basket** = sales ÷ invoices;
  the best branch is the line with the highest basket.
- **Active buyers** = distinct customers of those invoices, counted once across channels, internal accounts excluded.
  **New** = buyers whose first purchase (`CustomerMetrics.first_purchase_at`) falls in the period.
- Periods: امروز (hourly, midnight Tehran to now), ۷ / ۳۰ / ۹۰ روز (ending now), دلخواه (Jalali range, to now if it ends today).
  The comparison is the previous window of the same length. Where it starts before in-store history (2025-05-31 =
  1404/03/10) every combined change is «—» and the dashed comparison line is hidden; online-only figures still compare.
- «امروز تا این لحظه»: today from midnight to now vs the same weekday last week up to the same time; «یک ساعت اخیر» = the
  last 60 minutes. Labelled with the last successful sync time: figures are as fresh as the sync, not real time.
- Payloads are cached 60 s; a target edit clears the cache. No number on the page is hard-coded or a fallback.

## Sales targets (`sales_targets`, audit `sales_target_changes`)
- One amount per Jalali year, month and sales line (online, sari, gorgan, capri), in toman, unique per (year, month, line).
  The company target is the sum of the four lines. Edited in Settings «تارگت‌ها» by super_admin, admin and manager
  (grid in million toman, row and column totals, clear per month); every changed cell is audited (old → new, who, when, source).
- «کپی از سال قبل + X٪»: last year's target for the same month and line, or else last year's sales, × (1 + X/100), rounded to a
  million toman. In-store months before 1404/03/10 have incomplete history and stay empty. Preview only until «ذخیره».
- Progress for the current Jalali month, season (بهار … زمستان) or year (Esfand 29 or 30):
  - expected = elapsed days (today counted) ÷ total days; progress = actual ÷ target; gap = progress − expected (points);
  - pace badge «جلوتر» when progress ≥ expected, else «عقب»;
  - forecast = actual ÷ elapsed days × total days; required daily = (target − actual) ÷ remaining days (none on the last day);
  - line status: «جلوتر از برنامه» gap ≥ +3, «طبق برنامه» within ±3, «عقب از برنامه» < −3.
- A line has a target for a period only when every month of the period has one; otherwise «تارگت ندارد». The company
  figures add up only the lines that have a target (the page names them). No line with a target → the empty state with
  «تعریف تارگت این ماه»; never a number.

## «نیاز به توجه» (up to 5, hidden when empty; each links to its module)
1. Lines behind the month target pace (status «عقب»), with the worst line's required vs current daily sales. Link: Settings
   «تارگت‌ها» for target editors, otherwise the home target section. Everyone who can open Home.
2. New «پیشران فروش» products: status became driver in the last 7 days (`product_status_changes`, written by the daily
   products pass). Everyone.
3. Overdue Call Center tasks (open, due before now) and open escalations. Call managers only (super_admin, admin, manager).
4. Customers who dropped from a **top tier** in the last 30 days (owner decision 2026-11-13): the top N enabled tiers of each
   channel of the active rule set, by rank (`HOME_TIER_DROP_TOP_N`, default 3; codes are read from the rules, never hard-coded).
   Natural drops only (reason daily/sync, same channel, not to «no tier»), internal accounts excluded. Text names the tiers
   («۴۲ مشتری از سطوح VIP، الماس و طلایی ۱ پایین آمدند»); hidden at 0. The link opens the customer list with
   `tier_change=down&tier_change_after=…&tier_change_from=<codes>`, which returns exactly the counted customers. Everyone.
5. A failed sync more recent than the last successful one. Super admin only.
