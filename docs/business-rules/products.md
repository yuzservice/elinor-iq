# Products (Products page and Product 360)

Status: implemented on `feature/products-redesign` (2026-11-10), not merged; owner reviews locally. References: `docs/design/products-prototype.html`, `docs/design/product-360-prototype.html` (sample data). Source: `apps/products/categories.py`, `daily.py`, `stock.py`, `report.py`, `product360.py`; `pages/ProductsPage.tsx`, `pages/Product360Page.tsx`, `features/products/`, `features/categories/`. Decision: [[0008-products-summary-tables]].

## Categories
- The tree mirrors the website: title, parent, status. Our Elinor client has no category endpoint, so `sync_categories` (and the daily pass) keeps the tree and product links current from the `categories` inside product payloads. Products without a payload keep the dump's links.
- Inactive categories are hidden from selectors but keep their history. Where a title repeats, the label adds the parent: «مانتو (پوشاک)».
- A filter by category means that category and every descendant (`category_ids`). The customer list's old `categories` (titles) map to the exact categories only, so old saved views and call lists return the same customers.
- Comparisons use a product's primary category: its deepest linked category (lowest id on a tie).

## Daily product sales (`product_daily_sales`)
- Grain: Tehran day × product × variant × sales line (`ONLINE`, `SARI`, `GORGAN`, `CAPRI`). Built only from `semantics.py`: qualifying online items, qualifying POS items, POS refund items.
- `units`: sold units. `net_units`: sold minus in-store returns (returns count on the return day). `revenue`: amount × quantity of sold lines minus returned lines. Online and POS `amount` are both per unit after discount (verified: `Σ amount × quantity = Order.total_amount` for 257k of 270k qualifying orders). `Order.total_amount` and POS tenders are never used.
- `discounted_units`: sold units whose line has a discount. `invoice_count`: invoices that sold it.
- Internal accounts (desk/staff) place orders for real customers (about 34% of online item revenue locally), so product sales keep them, as all sales totals do (`operators.py`); owner decision, 2026-11-10. `PRODUCTS_EXCLUDE_INTERNAL_SALES=true` drops them from product sales and bundles. Buyers, prospects and call lists always leave them out.
- Rebuilt in full by the daily pass (one transaction; readers keep the old rows until commit). Idempotent.

## Product metrics (`product_metrics`, one row per product that ever sold)
- Windows end on the refresh day (`as_of`). `units_7/14/28`, `revenue_7/14/28`.
- Weekly speed: net units of the last 28 days ÷ weeks, where weeks = min(28, days since first sale), at least 7 days. Full-price speed uses sold units without a discount.
- `units_first14`: units in the first 14 days from the first sale. Trend: net units of the last 14 days vs the 14 before (none when the earlier 14 had none).
- Discount share and return rate: last 90 days. `last_sale_by_line`: last sale day per sales line.
- Category median: median weekly speed of the category's products that are not stale. Ratio = speed ÷ median.

## Statuses (thresholds in `settings.PRODUCTS_RULES`, always within one category)
Precedence: راکد > پیشران فروش > رو به رشد > کند > عادی.
- «راکد»: no sale for 30 days or more.
- «پیشران فروش»: top 10% of full-price speed in its category and at least 10 units in 28 days.
- «رو به رشد»: trend ≥ +20%.
- «کند»: bottom 20% of speed in its category.
- Otherwise «عادی». Percentile rules need at least 5 selling products in the category (`min_category_size`); smaller categories get only «راکد», «رو به رشد» or «عادی».
- The Products page shows products whose last sale is within 365 days; older ones are retired, not «راکد».

## Central stock (`product_central_stock`)
- `main_balance` per variety from the read-only product API (`/admin/products/{id}`): central warehouse only. No branch stock anywhere; `Variant.quantity` is never reported.
- `refresh_central_stock` runs every scheduler loop: balances already in stored payloads first, then up to `PRODUCTS_STOCK_REFRESH_PER_RUN` (150) products sold in the last 90 days whose balance is older than 20 hours, within the client's rate limit. It stops at the first API error.
- «احتمالاً تمام شده»: central stock 0, and last-7-day net units at least 70% below the weekly speed of the 4 weeks before (that speed at least 1 a week).
- «نیاز به شارژ فوری»: status پیشران or رو به رشد, and central stock below lead time (14 days, `PRODUCTS_LEAD_TIME_DAYS`) × current daily speed. «احتمالاً تمام شده» wins when both hold.

## Products page
- State lives in the URL. Periods ۷ / ۳۰ / ۹۰ روز, ۱۲ ماه (ending today) or a custom range; comparison with the previous equal range, the same range a year earlier, a custom range, or none.
- A change is shown only when every included sales line has history for the whole comparison range (in-store from 1404/03/10 = 2025-05-31, online from 2022-01-12); otherwise «—».
- With no filter the table shows the top 10 of the chosen sort (revenue by default), without paging; «نمایش همه کالاها» or any filter shows the full sorted, paged list (20 a page). Without a status or stock filter the list holds products that sold in the range.
- Cards 2–4 count every product of the scope with that status or flag, whether or not it sold in the range, and filter the table. The branch strip ignores the channel filter and sets it.
- Table «فروش هفتگی»: net units in the range ÷ weeks (the range capped at the product's age, at least 7 days). «نسبت به دسته»: the 28-day ratio. «تغییر»: net units vs the comparison range.
- Bundles: invoices (baskets) per product or primary category, per channel (online, in-store, both). Lift = shared × all baskets ÷ (baskets of A × baskets of B); «اگر اولی خریده شود» = shared ÷ baskets of the item with fewer baskets. Pairs under 5 shared baskets are hidden. «سیگنال اولیه»: fewer than 15 shared baskets and lift ≥ 3. «فقط سیگنال‌های تازه»: new in the range, or shared baskets up at least 50% vs the comparison.

## Product 360
- The page's range and comparison come from the link. Daily chart from the first sale (the last 180 days for older products), with the category's typical day (median speed ÷ 7) as a dashed line.
- Branch index = the line's share of this product ÷ the line's share of its category, same range.
- Suggestions are rules, each with its reason, and each appears only when its data exists:
  - Charge: status پیشران, رو به رشد or عادی, central stock known, and need = ⌈daily speed × lead time⌉ − central stock > 0. The largest variant needs (size, colour) use the same speed basis.
  - Best branch: index ≥ 1.2 with at least 5 units; the weakest is named when its index is below 0.8.
  - Bundle: the strongest pair with lift ≥ 2.
  - Discount: with at least 10 units, under 20% discounted; «تخفیف لازم نیست» for پیشران/رو به رشد, «تخفیف محدود را امتحان کنید» for کند/راکد.
  - Prospects: customers who bought the primary category (with descendants) in the last 90 days and never this product.
- Buyers (from the first sale, internal accounts out): count, share whose first purchase was this product, share with more than one unit or invoice, average basket = line totals of the invoices holding this product, buyers by tier.
- «ساخت لیست تماس از خریداران» creates a fixed call list from the customer-list filter `{products: id}`. «لیست مشتریان مستعد» creates a fixed list of the prospects. Both create a draft program and open its form step (call managers only).
