# Customer 360 (customer page)

Status: implemented on `feature/customer-360-redesign` (2026-11-04), not merged. Design reference:
`docs/design/customer-360-prototype.html` (its numbers are sample data; its «مدیر / کارمند فروش» switch is prototype-only).
Source: `backend/apps/customers/profile360.py`, `detail.py`, `views.py`; `backend/apps/calls/agent.py` (call cards);
UI `frontend/src/pages/Customer360Page.tsx`, `features/calls/CustomerCalls.tsx`.

## Value cards (`value` in `GET /api/customers/<id>/`, computed live)

- Invoices = qualifying online orders + qualifying POS sales (`apps/sales/semantics.py`).
- مجموع خرید = online `total_amount` + signed POS item lines (`tiers._signed_line_sql`; refund headers included), as
  `CustomerMetrics`. میانگین سبد = total / invoices, `int(round())`. Toman as stored; shown with one decimal in
  هزار / میلیون / میلیارد.
- Tier comparison: the customer's current `tier_code` vs the average of that tier in `CustomerMetrics` (internal accounts
  excluded): total = mean of `total_amount`; basket = sum of totals / sum of invoices. Percent = `round((value / avg − 1) × 100)`.
  Cached per day (`customer-360-tier-averages:<date>`). No tier, or an internal (desk) account → no comparison text.
- آخرین خرید = Tehran calendar days since the last qualifying invoice.
- «معمولاً هر N روز خرید می‌کند» = median gap in days between distinct Tehran purchase days. Needs ≥ 3 invoices and at
  least one gap; otherwise hidden. Amber when days since the last purchase > N.

## Taste row (`taste`)

- دسته / سایز / رنگ: most frequent value over qualifying item lines (online and POS); ties go to the most recent value,
  then alphabetical; empty values ignored.
- شعبه: most frequent branch over invoices (online = «سایت»).
- پرداخت per invoice: online = «شاپینو» if `is_shopino`, else the successful gateway (اسنپ‌پی / دیجی‌پی) or «درگاه آنلاین»;
  POS = the first positive tender in this order: اسنپ‌پی، دیجی‌پی، کیف پول، کارت به کارت، نقد / کارتخوان.
- خرید با تخفیف = % of invoices with `discount_amount > 0`. Unknown values show «—».

## Header

Name, tier badge (colors from the customer list, `tierColors`) with channel, purchase channel. Open `CustomerCallTag`s
with an active tag, the earliest open follow-up task, the last call (outcome, days ago, agent). `tel:` link and «کپی شماره».
«تماس نگیرید» badge and the manager clear action as before.

## Tabs (each loads on first open)

- فعالیت‌ها: `GET /api/customers/<id>/timeline/?type=all|invoice|call|tier|discount&page=` (20 per page, newest first).
  Invoices include non-qualifying ones (marked لغوشده / مرجوعی). An invoice with a discount also shows a separate
  «استفاده از تخفیف» row; the «تخفیف» chip returns discounted invoices only.
- فاکتورها: existing purchase history (all invoices, 20 per page); rows add `payment` and `amount` (POS = signed lines).
- کالاها: existing product history as cards.
- تماس‌ها: `GET /api/calls/customers/<id>/` adds `stats` (calls, connected, sum of `CallLogPurchase.amount`, next
  follow-up) and per log `tags`, `purchase {amount, days_after}`, `attempt {n, of}` (retry outcomes only; of = retry_times + 1),
  `followup_at` (an open follow-up created within 5 s of the log). Not-connected calls show the short card.
- مشخصات: identity, addresses, discounts.

## Access

`sales_agent`: only customers with a call task assigned to them (`SalesAgentScopeMiddleware`, also for `timeline/`).
The detail payload drops email, national code and full addresses (city and province only). Everything else is visible.
