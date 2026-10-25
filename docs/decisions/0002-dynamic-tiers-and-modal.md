# 0002 — Dynamic tiers and the tier-rules modal (Amendment A)

- **Date:** 2026-10-24
- **Status:** Accepted (approved by product owner, with the "Correction to Amendment A"), implemented on `main`, committed 2026-10-24
- **Amends:** [[decisions/0001-configurable-tier-rules]]
- **Rules:** [[business-rules/customer-tiers]]

## Context
Phase 1 allowed only threshold edits on 8 fixed tiers, with a days from/to range, inside Settings.
The product owner wants super admins to shape the tier list itself and edit it where customers are managed.

## Decisions
1. **Tiers are an ordered, configurable list per version.** Add, delete, disable, reorder and rename tiers.
   Priority = list order; first match wins (unchanged).
2. **Server-owned codes.** Original codes stay; new tiers get `CUSTOM_<n>` from a never-decreasing counter. Clients
   never choose codes, so history, filters and campaign codes stay stable.
3. **Comparison per condition.** Purchase count and lifetime amount take `gte` or `lte`.
   **Days since last purchase is upper-bound only (`<=`), with no operator** (Correction to Amendment A).
   *Update 2026-10-25 (owner request):* a separate «از» bound (`days_since_last_min`, `>=`) was added next to «تا»;
   both have no operator key. Version 1 is unchanged.
   Version 1 therefore evaluates BRONZE_1 before SILVER and uses BRONZE_3 (`purchase_count >= 1`) as the catch-all;
   equivalence with the old rules is tested.
4. **Titles from versions, not constants.** `TIER_LABELS` is now only the version-1 default. Labels for stored codes
   come from the active version, then archived versions, then the code. History rows snapshot titles.
5. **Public tier list.** `GET /api/customers/tiers/` (any signed-in user) feeds filters, badges and Customer 360,
   so the frontend has no hard-coded tier list. Known codes keep their icon and colour; new ones are neutral.
6. **UI moves to the Customers page** as a modal («قوانین سطح‌بندی» button, deep link `?tierRules=1`), with steps
   «قوانین» | «پیش‌نمایش» | «تاریخچه». Still super admin only.
7. **Migration 0006 rewritten in place.** It had only been applied to the local dev database and to throwaway test
   databases; the code was never committed or pushed. No 0007.
8. **Campaigns unchanged.** `campaigns.py` keeps its fixed codes; preview warns when a deleted or disabled tier is
   one of them.

## Consequences
- Rule JSON shape changed (`{"tiers": [...]}`); the local dev DB needs 0006 rolled back and re-applied.
- Up to 12 tiers. A tier code is at most 16 characters (`Customer.tier_code`).
- Out of scope: strict `>`/`<`, condition ranges, windowed amounts, branch or gateway conditions, changes to
  `campaigns.py`, exchange counting, Customer 360 content.
