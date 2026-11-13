# Hidden sales lines

Source: `backend/apps/sales/semantics.py` (`hidden_sales_lines()`, `visible_sales_lines()`, `visible_pos_lines()`,
`visible_pos_sales()`, `visible_pos_items()`, `exclude_hidden_lines()`, `sales_line_label()`), `frontend/src/lib/salesLines.ts`.
Decision: [[0010-hidden-sales-lines]].

## Setting
- `HIDDEN_SALES_LINES` (env, `backend/config/settings.py`): comma list of `SalesLine` codes, case-insensitive. Default `CAPRI`.
  Empty = show every line. Unknown codes and `ONLINE` are ignored, so at least ONLINE is always visible.
- After changing it: restart the backend, then run `python manage.py products_daily` once (rebuilds product metrics, statuses
  and baskets from visible lines). `sales_daily_summary` needs no rebuild.

## Reports (hidden lines excluded)
- Sales KPIs, trend, summary, orders list, products, returns, branch comparison and insights (`apps/sales/kpis.py`,
  `analysis.py`, `services.py`), sales filter options, coverage notices (`apps/core/coverage.py`).
- Home summary, trend, branch table and targets (`apps/core/home.py`, `apps/sales/targets.py`); the targets grid shows and saves
  visible lines only (stored targets of a hidden line stay in the table).
- Customers overview lenses and «همه الینور» total (`apps/customers/overview.py`, `_events_sql(visible_only=True)`); customer
  list branch filters and branch tags (`apps/customers/list_query.py`; purchase counts stay all-line, like `CustomerMetrics`).
- Products page, branch strip, Product 360 (`apps/products/report.py`, `product360.py`); `product_metrics` and baskets
  (`apps/products/daily.py`). The Sales products table keeps `capri_units` in the payload (always 0 while hidden).

## Params
A hidden line in `line=`, `lines=`, `branches=`, `sales_line=` or `sales_lines=` is dropped silently (same as no filter).

## Not affected
Sync/import/diagnostics, the POS sync branch picker in Settings, the tier engine and tier history, `CustomerMetrics`,
loyalty/campaigns (gift-wallet branch distribution), call-center jobs. Customer 360 history keeps hidden-line purchases,
labelled «فروشگاه حضوری».
