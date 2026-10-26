# 0005 — RFM report Stage 1b: action-first report, call list, movement windows

- **Date:** 2026-10-26
- **Status:** Accepted (approved by product owner), implemented on `main`, uncommitted
- **Builds on:** [[decisions/0003-rfm-report-and-club-menu]], [[decisions/0004-internal-accounts]]
- **Rules:** [[business-rules/customer-rfm]]

## Context
Local data: about two thirds of purchasers have one purchase, most are hibernating, and a few thousand customers buy
per month. The Stage 1 report described segments but did not say who to contact now.

## Decisions
1. Every element answers «با چه کسی، الان چه کنیم؟». No chart library: SVG sparklines and Tailwind bars.
2. Purchase rhythm is stored per customer (first/second purchase, average interval, overdue) in the same set-based
   refresh; Customer 360 reads the stored values.
3. Snapshots also store facts (counts, amounts, days) so KPIs can show a previous month and a 12-month trend;
   older months are refilled with `backfill_rfm_snapshots --rebuild`.
4. Segments are ordered by action priority, not by value. Movement uses a separate value rank.
5. New «لیست تماس» tab: overdue customers (≤ 365 days) by value, with CSV export.
6. Exports are logged through the application logger (no new table).
7. Out of scope: branch × segment, cohort triangle, taste per segment, CLV, contact tracking, club audiences, campaigns.

## Consequences
- Same-day repeat purchases (interval 0) are not treated as overdue; this deviates from a literal reading of the
  spec formula and is noted for the owner.
- Report queries disable parallel workers for their transaction; the compose file's Postgres `shm_size` should be
  raised (owner decision) so parallel plans are safe elsewhere.
