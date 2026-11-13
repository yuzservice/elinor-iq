# 0010: Hide sales lines from reports through one setting, keep the data

Date: 2026-11-14. Status: implemented on `feature/hide-capri`, awaiting owner review. Rules: [[hidden-sales-lines]].

- The owner wants the Capri store out of every report without losing data. One setting, `HIDDEN_SALES_LINES` (env, comma list,
  default `CAPRI`, empty = show all), drives every report; there is no per-page switch.
- Only store lines can be hidden. ONLINE and unknown codes are ignored, so the setting can never hide every line.
- Nothing is deleted. Sync, import, diagnostics, the tier engine, loyalty/campaigns, `CustomerMetrics` and tier history read
  every line as before, so changing the setting creates no `CustomerTierHistory` rows and sends no messages.
  The `qualifying_*` helpers in `apps/sales/semantics.py` stay all-line for that reason; reports use the new `visible_*` helpers.
- Line-keyed tables (`sales_daily_summary`, `product_daily_sales`) keep every line and are filtered when read. Cross-line tables
  (`product_metrics`, product status changes, basket items/pairs) are built from visible lines only, so after changing the
  setting run `products_daily` once.
- A request naming a hidden line (`line=`, `lines=`, `branches=`, `sales_line(s)=`) is treated as if the param were absent.
- A customer's own history (Customer 360) keeps the hidden line's purchases, labelled «فروشگاه حضوری».
- The frontend reads `visible_sales_lines` from `/api/auth/me/` (a new top-level key; `features` is unchanged) and builds every
  branch list and branch-list text from `frontend/src/lib/salesLines.ts`.
