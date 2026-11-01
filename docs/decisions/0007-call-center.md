# 0007: Call Center as a separate app, with its own attribution table

Date: 2026-11-02. Status: implemented on `feature/call-center`, awaiting owner review.

- New app `apps/calls`, additive migrations only. No change to sync-owned `Customer` fields.
- Agent scope is enforced centrally by middleware, because most existing views only require `IsAuthenticated`.
- Attribution runs nightly into `CallLogPurchase`, so reports never join sales tables at request time.
- Additions beyond the owner's spec, each needed by a required behavior: `CallTask.customer_value` and `last_tag_ids` (sort and filter the agent list without sales tables), `CustomerCallTag` (report cards without reading log arrays), `CallLogPurchase.purchase_count` (one row per log can hold several purchases), `job_*` fields on `CallProgram` and `CallList` (background progress).
- Alternatives rejected: a GIN index on log JSON (owner rule); queue infrastructure (the existing thread pattern from `tier_refresh` is enough for this load).
