# 0009: Home page on real figures, with monthly sales targets per line

Date: 2026-11-13. Status: implemented on `feature/home-redesign`, awaiting owner review. Rules: [[home-and-targets]].

- Targets are stored per Jalali month and sales line (`sales.0006`, additive), with an audit table. Seasons and the year are sums
  of months, so one grid serves every period, and Esfand 29/30 and leap years come from `jdatetime`.
- The target metric is exactly the home sales card (online order value + in-store sold lines), so the progress bar and the
  card can never disagree.
- Company progress adds only lines that have a target for every month of the period. A partial target would otherwise make the
  company look behind or ahead for the wrong reason.
- Home reads the raw order and POS tables for its own window (indexed by date) and caches each payload 60 s. The daily product
  table is not reused for revenue because its in-store revenue nets returns, while the home card counts sold lines.
- New drivers need status history, so the daily products pass now records status changes (`products.0004`, additive).
- Attention counts that do not depend on the user are cached; role filtering runs per request.
- Removed: the hard-coded 3-billion target (Home gauge, Sales page section and modal), every fake or fallback home number
  (1420 orders, «↑ ۸.۲٪», «آنلاین ۶۲۰ / حضوری ۸۰۰», AOV values, the «نرخ وفاداری و بازگشت» card, the fake transactions table),
  `apps/core/home_metrics.py`, and the unused dashboard components.
- The tier-change filter now counts only natural, same-channel moves (owner instruction 2026-11-13).
