# Home page and sales targets

Status: v1 released (`766bff9`); v2 (pickers, branch table, one trend, daily summary) on `feature/home-v2-performance` (2026-11-13), not merged. Reference:
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
- **Items** = sold units of those invoices' qualifying lines.

## Filters (all in the URL; every section follows them)
- «بازه»: امروز (default; midnight Tehran to now, hourly), دیروز (the whole previous Tehran day, hourly), ۷ / ۳۰ / ۹۰ روز اخیر
  (whole days ending now), بازه دلخواه (Jalali range; to now when it ends today; hourly when it spans 1–3 days, daily after).
- «مقایسه», always named on the range line:
  - for امروز: همان روز هفته قبل (default) or همان روز سال قبل (the same Jalali day), each from midnight up to the same time
    of day; or بدون مقایسه. دیروز uses the same choices for the whole day (−7 days, or the same Jalali day last year). (Before v2, today was compared with the previous 24 hours: yesterday evening to midnight.)
  - for other ranges: دوره قبل (default; the same number of whole days just before, the last day cut at the same time), همین
    بازه سال قبل (the same Jalali dates a year earlier), or بدون مقایسه.
  - A change exists only when every selected line has history for the whole comparison window (in-store from 2025-05-31 =
    1404/03/10, online from 2022-01-12); otherwise «—» and the trend shows no dashed markers.
- «شعبه»: همه شعب, سایت, ساری, گرگان, کاپری. One branch limits the cards, the branch table (no «کل الینور» row), the trend and
  the targets (only that branch's target). «نیاز به توجه» stays company-wide, except the target item, which follows the branch.

## Sections (top to bottom)
- Branch tiles (v3, above the cards): «کل الینور» with a donut of branch shares and a share legend, then one tile per branch
  ranked by sales: rank, sales, change, a sparkline from the trend's per-bucket `lines` (up to 24 bars), a bar with the
  comparison marker, invoices / basket and the comparison (or share). Clicking a tile toggles «شعبه» to that branch; while one
  is selected the others stay visible, dimmed, from the unfiltered payload of the same range (cached server-side).
- Four cards: فروش (online / in-store share when all branches), تعداد فاکتور (with items sold), میانگین سبد خرید, خریداران
  (new share). Each shows its change against the named comparison.
- Tiles heading «امروز تا این لحظه، به تفکیک شعبه» (live dot, last sync time) for امروز, «دیروز، به تفکیک شعبه» for دیروز,
  «فروش شعب» otherwise. (The v2 branch table was replaced by the tiles.)
- «روند فروش», the only chart: امروز / دیروز → 24 hourly bars (keys 0..23; hours after now are faded, never skipped); custom
  ranges of 1–3 days → hourly bars across the days (keys "YYYY-MM-DDTHH:00", hours after now are future; axis MM/DD at hour 0,
  «۱۲» at noon, dashed separators between days); other ranges → daily bars (axis: Jalali MM/DD). More than 40 bars use a 1 px
  gap. Hourly comparisons align hour by hour with the comparison window. The comparison is a dashed marker on each bar, with the comparison named in the legend.
- Targets, then «نیاز به توجه».

## Speed
- Closed days come from `sales_daily_summary` (one row per day and sales line: sales, invoices, items, buyer ids), rebuilt
  nightly by `sales_daily_summary --if-due` with the same definitions; only today, days after the last nightly build and a
  partial last day are read live from the sales tables. Buyers are counted distinct across the stored ids and the live ids,
  internal accounts removed at read time. Tests check stored = live on several ranges.
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
