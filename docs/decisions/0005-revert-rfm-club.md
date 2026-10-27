# 0005 — Revert RFM and the «باشگاه مشتریان» menu; keep internal accounts

- **Date:** 2026-10-27
- **Status:** Accepted (product owner decision), implemented on `main`
- **Archive:** branch `archive/rfm-club-2026-10-27` (= `main` at `4a69c5d`, before the revert). `wip/rfm-stage-1b` untouched.
- **Supersedes:** [[decisions/0003-rfm-report-and-club-menu]] (reverted). Amends [[decisions/0004-internal-accounts]].

## Decision
1. The Customers area on `main` returns to `production` (`3f5de33`): no Club menu (`/club`, `ClubPage`), the
   Customers page has only the «لیست مشتریان» and «کمپین‌ها» tabs, no RFM anywhere (no `rfm.py`, `CustomerRfm`,
   `CustomerRfmSnapshot`, `rfm/summary/`, RFM card, RFM list filters/sort, `backfill_rfm_snapshots`).
2. **Internal accounts are kept** ([[business-rules/internal-accounts]]): `InternalAccount`, exclusion by customer id
   in `operators.py` / `tiers.py` / list ranking, the super-admin API, the Customer 360 menu and confirmed-account
   banner, and the same 15 owner-confirmed accounts (6 staff, 9 desk).
3. They use **new migrations** on top of `0007_tier_channels`: `0008_internalaccount` (table + desk-mobile move) and
   `0009_seed_internal_accounts` (reversible seed). The archived names (`0007_customer_rfm`, `0008_internal_accounts`,
   `0009_seed_confirmed_internal_accounts`, `0010_merge_tier_channels`) are not reused.
4. Detection signals (suspected internal accounts, `SUSPECTED_MIN_SCORE`) depended on `customer_rfm` and are
   **paused with RFM**; the Customer 360 suspected banner and the list `internal` filter are removed.
5. `production` and the server were not touched.

## Reintroducing RFM later
- Start from production's latest migrations and add **new** RFM migrations after them (never the archived ones).
- Rebuild signal scoring on those new migrations, then restore the suspected banner and list filter.
- `wip/rfm-stage-1b` (with `0010_rfm_stage_1b`) is based on the archived graph and needs rebasing onto the new one.

## Local database
The local `elinor_iq` DB was rolled back (owner-approved) with `migrate customers 0006_tier_rule_sets`, because
`0007_customer_rfm` is a sibling of `0007_tier_channels`, not its descendant. `0007_tier_channels` was re-applied
(its only local data was its own draft, recreated as v2; no customer had `tier_channel`), then the new 0008/0009.
