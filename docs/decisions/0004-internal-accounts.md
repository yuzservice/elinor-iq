# 0004 — Internal (staff) accounts excluded from customer reports

- **Date:** 2026-10-25
- **Status:** Accepted (approved by product owner), on `main`. Re-implemented without RFM on 2026-10-27
  (decision 0005): new migrations `0008_internalaccount`, `0009_seed_internal_accounts`; decision 2 (signals) paused.
- **Rules:** [[business-rules/internal-accounts]]

## Context
Some staff placed orders under their own customer account for real customers, so they rank as top customers
in tiers, RFM and buyer counts. The desk account already had this problem and was excluded by one hard-coded mobile.

## Decisions
1. **One mechanism for desk and staff.** `InternalAccount` rows replace the hard-coded `OPERATOR_MOBILES`;
   migration 0008 moved the desk account into the table. Public helper names in `operators.py` are unchanged.
2. **Human confirmation only.** Detection signals flag likely accounts; nothing is excluded automatically.
3. **Confirmed from Customer 360 and found through a list filter.** No separate page or club tab.
4. **Exclusion matches the desk account:** out of tiers, RFM, ranking, buyer counts and customer reports;
   sales totals unchanged.
5. **Super admin only** for the management API, the 360 banners/signals and the list filter.
6. A later program for these accounts will be designed separately.

## Consequences
- Exclusion is by customer id. Existing tests that created the desk account by mobile now also create its
  `InternalAccount` row, as the migration does on real data.
- `campaigns.py` imports `exclude_operator_accounts` but never calls it; campaign reports exclude internal accounts
  only through their NULL tier. Left unchanged by rule.
