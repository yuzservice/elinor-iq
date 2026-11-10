# 0008: Products pages on daily summary tables

Date: 2026-11-10. Status: implemented on `feature/products-redesign`, awaiting owner review. Rules: [[products]].

- The Products page and Product 360 read five additive tables (`products.0003`): `product_daily_sales`, `product_metrics`, `product_central_stock`, `product_basket_items_daily`, `product_basket_pairs_daily`. Page requests never read the raw sales tables. Product 360 reads qualifying items by product id for buyers and prospects only.
- The daily pass rebuilds them in full (13.8 s on the local dump: 781k daily rows, 1.71M pair rows), instead of incremental day windows. Late cancellations and status changes on old orders are then always right, and the code stays small.
- Bundles are stored per day, so the page's own range and comparison apply. Category bundles use each product's primary (deepest) category and count each basket once.
- Central stock is `main_balance` from the product API, central only, refreshed for recent sellers within the rate limit; `Variant.quantity` stays unused.
- Internal accounts stay in product sales, as in every sales total; one setting excludes them. Owner to confirm (the spec said "excluded").
- Removed: `apps/products/intelligence.py` and its endpoints (`/api/products/`, `/bundles/`, `/size-color/`, `/<id>/360/`). They looped over sales rows in Python, used fixed thresholds and a hard-coded category, and summed online `amount` without × quantity.
- Rejected:
  - materialized views: the codebase already uses plain tables rebuilt by set-based SQL (`CustomerMetrics`), and the bundle build needs a temporary table;
  - per-request pair mining (seconds per range);
  - branch stock, which the API does not expose.
