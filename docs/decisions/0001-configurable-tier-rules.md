# 0001 — Configurable customer tier rules (Phase 1)

- **Date:** 2026-10-24
- **Status:** Accepted (approved by product owner), implemented on `main`, committed 2026-10-24, not yet deployed
- **Rules:** [[business-rules/customer-tiers]]

## Context
Tier thresholds were hard-coded twice (SQL `_TIER_CASE` and Python `tier_code_for`). Changing them needed a code
release, and nobody could see who would move before a change took effect. Past tiers were not recorded.

## Decisions
1. **Super admin only.** All tier-rule endpoints use `IsSuperAdmin`; the UI shows nothing to other roles.
   `POST /api/customers/refresh-tiers/` keeps its existing permission and now uses the active rules.
2. **Inside Settings.** The editor is a panel on `SettingsPage` («قوانین سطح‌بندی مشتریان»), not a new page.
3. **Thresholds only.** Four optional parameters per tier. Facts, global guard, priority, labels and the
   set of tiers stay fixed.
4. **Preview with samples before activation.** Activation is refused unless the current draft was previewed
   after its last edit. Preview shows counts, transitions and up to 100 sample customers.
5. **Safe activation.** One background job, one transaction, the `customer_tiers` lock and a Postgres
   advisory lock shared with every tier writer. Old rules remain until the new calculation succeeds.
6. **History recorded now.** `customer_tier_history` stores every actual tier change with its reason and rule
   version. Campaign reports move to historical tiers in a later phase.
7. **Exchange counting unchanged.** POS `both` sales still do not count as purchases and only affect the amount.

## Consequences
- One source of truth for rules (`tier_rules.py`); SQL and Python evaluation are tested for parity.
- Tier writes are serialized, so an incremental sync waits while an activation runs.
- Out of scope for Phase 1: windowed amounts/counts, branch or gateway parameters, priority reordering,
  adding/removing tiers, Customer 360 changes, connecting campaigns to tier history.
