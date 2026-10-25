# 0003 — RFM report and the «باشگاه مشتریان» menu (Stage 1)

- **Date:** 2026-10-25
- **Status:** Accepted (approved by product owner), implemented on `main`, uncommitted
- **Rules:** [[business-rules/customer-rfm]]

## Context
The «مشتریان» menu mixed loyalty tiers, campaigns and a list with placeholder KPIs. The product owner wants a
principled RFM report that drives sales actions, with tiers and campaigns in their own club menu.

## Decisions
1. **RFM is a separate analytical layer**, not related to tiers. Tier logic, tier rules and `campaigns.py` are unchanged.
2. **Windows:** R = days since last purchase over the full history; F and M over the full history (online since
   2022-01-12, POS since 2025-05-31). 12-month figures are shown alongside as context only.
3. **Fixed thresholds, no quintiles.** Provisional until the distribution report is reviewed; changed only in code.
4. **Monthly segment snapshots** (Jalali month), used for movement reporting and later campaign evaluation.
5. **Control groups** for campaigns come in stage 3, not now.
6. **Campaign execution stays manual** (Elinor panel, or SMS + CSV export); an SMS integration comes later.
7. **New «باشگاه مشتریان» menu** (`/club`): tiers, tier rules and campaigns move there. «مشتریان» becomes
   «گزارش RFM» (default) and «لیست مشتریان». Old links redirect (`?tab=campaigns`, `?tierRules=1`).
8. **Payment filter «سایر»** = purchasers who never paid with SnappPay or DigiPay (opposite of the existing
   installment filter), decided by the product owner during implementation.

## Consequences
- Customer 360 now has an RFM block; its module docstring and two older tests that asserted "no RFM in 360" were updated.
- Amounts in RFM are «خرید خالص مشتری», not sales revenue, and must not enter sales reports.
- Later stages: club audiences from RFM segments (stage 2), campaign runs and control-group evaluation (stage 3).
