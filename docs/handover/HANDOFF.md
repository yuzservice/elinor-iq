# Project Handoff — Elinor IQ V2

Durable state for the next engineer or AI assistant. Do not rely on chat history; this file plus the repo is the source of truth.
Update this file at the end of every implementation task (newest entry first in the Log).

Last updated: 2026-10-27 · **`production` = `3f5de33` (tier rules + «از» + channel-based tiers + channel-draft button), pushed; the server gets it when the owner runs `update.sh`**; `main` is development (see §2 Branches)

## 1. Current priority

**Customer RFM and Customer 360.** Requirements and specs come from the Product Architect session.
The engineer implements only explicitly approved tasks.

- Done and pushed: Customer Tier Rules (Phase 1 + Amendment A + Correction), plus the «از» day bound (`f308fec`).
- Done and pushed: RFM report Stage 1 + «باشگاه مشتریان» menu (`a8198d2`), internal (staff/desk) accounts with the
  15 confirmed accounts (`a76cdd8`), outdated UI prototypes removed (`accb9d8`). Not deployed yet. Stage 1b is cancelled for now.
- Out of scope until approved: Smart Direct (retired in `3bc0a48`); changes to `campaigns.py`; club audiences,
  campaign runs and control groups (later stages).

## 2. Workflow

1. Read `CLAUDE.md`, then use the `elinor-context` skill to pick one module.
2. Read that module's `## N.` section in `docs/modules/MODULE_REGISTRY.md` and the source files it names.
3. Use Graphify MCP (`.mcp.json` → `graphify-out/graph.json`) only for cross-module impact. Verify against source.
4. Present a plan and wait for explicit authorization before editing.
5. Run the module's tests (backend tests need PostgreSQL via Docker Compose).
6. Update module docs and this file. No commit/push unless asked.
7. Tests: run the module's test files while working and read only the summary
   (`pytest -q <files> 2>&1 | tail -30`). Run the full backend suite only when the owner asks for it
   (it is slow: the export tests alone take about 10 minutes).
8. **Branches** (owner rule, 2026-10-26):
   - `production` = what the server runs. `update.sh` deploys only `origin/production`
     (`bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/production/update.sh)"`;
     the old URL on `main` now deploys `production` too).
   - `main` = development. Unreleased work (RFM Stage 1, internal accounts) lives here and is not on the server.
   - A feature that should ship alone branches from `production`, merges into `production` for release, then
     `production` is merged into `main`.
   - Work in progress is parked on its own branch, e.g. `wip/rfm-stage-1b`.
   - Never run anything on the server; the owner runs `update.sh`.

## 3. State of the RFM / Customer 360 area

| Feature | Source | Tests | Status |
|---|---|---|---|
| Tier engine + tier rules admin/modal | `tiers.py`, `tier_rules.py`, `tier_rule_admin.py`, `TierRulesModal.tsx` | `test_customer_tiers.py`, `test_customer_tier_rules.py`, `tierRules.test.ts` | PASSING; committed (`cdddb45`, `f308fec`) |
| RFM report Stage 1 + club menu | `rfm.py`, migration `0007_customer_rfm`, `RfmReportPanel.tsx`, `ClubPage.tsx`, `CustomerListPanel.tsx`, `Customer360Page.tsx` | `test_customer_rfm.py`, `rfmDisplay.test.ts` | PASSING; committed |
| Internal (staff/desk) accounts | `operators.py`, `internal_accounts.py`, `rfm.py` (signals), migrations `0008_internal_accounts`, `0009_seed_confirmed_internal_accounts`, `InternalAccountPanel.tsx` | `test_internal_accounts.py`, `test_internal_accounts_seed.py`, `test_operator_accounts.py` | PASSING; committed |
| Customer export | `export.py` | `test_customer_export.py` | FAILING before this work (3× `.content` on a streaming response, 1× missing fixture `api_client`) |
| Campaign report | `campaigns.py` | `test_customer_campaigns.py` | FAILING before this work (`assert 0 >= 600000`) |

**Full backend suite not run (cancelled by owner); targeted suites only.** Latest targeted run: see the Log.

Rules and decisions: `docs/business-rules/customer-tiers.md`, `customer-rfm.md`, `internal-accounts.md`;
`docs/decisions/0001`–`0004`.

**Local database state (dev only):** 0006–0009 applied (15 active internal accounts: 6 staff, 9 desk). RFM refreshed; 12 monthly snapshots backfilled
(1404-08 … 1405-07). The desk account was moved into `customer_internal_accounts` by 0008.

**Production steps (in this order; not run yet):**
1. Update the server (`update.sh`); migrations 0007, 0008 and 0009 run when the backend starts
   (check: `docker compose exec backend python manage.py showmigrations customers`).
2. Full tier refresh, which also refreshes RFM and internal signals:
   `docker compose exec backend python manage.py refresh_customer_tiers --force`.
3. `docker compose exec backend python manage.py backfill_rfm_snapshots --months 12`.

Notes for the Product Architect / next task:
- RFM thresholds are provisional; review the distribution (Log) and adjust the constants in `rfm.py`.
- `campaigns.py` imports `exclude_operator_accounts` but never calls it; internal accounts drop out of campaign
  reports only through their NULL tier. Left unchanged by rule.
- Revenue figures must use `apps/sales/semantics.py` qualifiers; RFM amounts are «خرید خالص مشتری», not sales.

## 4. Knowledge infrastructure

| Item | Location | State |
|---|---|---|
| Project rules | `CLAUDE.md` | Present |
| Context skill | `.claude/skills/elinor-context/SKILL.md` | Present |
| Docs index (Obsidian vault root) | `docs/00-HOME.md` | Present |
| Module registry | `docs/modules/MODULE_REGISTRY.md` | Present |
| Architecture / risks | `docs/architecture/SYSTEM_OVERVIEW.md` (section 8) | Present |
| Feature verification | `docs/implementation-status/FEATURE_MATRIX.md` | Present; Customer Master rows re-run 2026-10-24, others `NOT_RUN` |
| Graphify graph | `graphify-out/` (tracked since `b238c21`) | Rebuilt at `accb9d8` on 2026-10-25 (2,176 nodes, 6,566 edges, 125 communities); community labels not refreshed (`graphify label` needs an LLM key). Graph files are modified but not committed |

## 5. Shared workspace rules

- Two sessions share this local repo. **Product Architect** is read-only by default; **Software Engineer** makes approved code and doc changes.
- Never edit the same file from both sessions at once.
- Git-tracked docs are the source of truth, not chat history or account memory. Keep `CLAUDE.md`, this file, business rules and decisions aligned with the code; do not duplicate docs.
- Commit and push to the approved remote only when explicitly authorized. Verify `git status` and ahead/behind counts; never assume work is backed up.
- Never commit secrets, credentials, database dumps (`source/`, `backups/`) or customer records. `.env` is gitignored.

## 6. Git and backup state (checked 2026-10-27)

- Remote `origin` → GitHub `yuzservice/elinor-iq`.
- `production` = `3f5de33` (channel-draft button on top of `1400d6b` channel tiers), pushed. Server: `1400d6b` per the owner (0007 applied;
  v2 active general, v3 draft general); gets `3f5de33` on the next `update.sh`.
- `main` now includes `production` (merge commit with `0010_merge_tier_channels`).
- `main`: `a8198d2` Stage 1, `a76cdd8` internal accounts (0008, 0009), `accb9d8` prototypes removed, `99d9efc` graph +
  handoff, `542c2c8` deploy from production — none of the RFM/internal-accounts work is on the server.
- `wip/rfm-stage-1b` (`d7bb88f`, pushed): RFM Stage 1b + postgres `shm_size: 256mb`; to merge into `main` when RFM resumes.
  Its `0010_rfm_stage_1b` and main's `0010_merge_tier_channels` will need one more customers merge migration then.
- Uncommitted: `graphify-out/` after `graphify update .` (and its backup folder `graphify-out/2026-10-25/`), and this file's latest edit.
- Tracked docs: `CLAUDE.md`, `docs/`, `.claude/skills/`.
- `b238c21` (owner) tracks Graphify artifacts, `.mcp.json`, `.graphifyignore` and the UI prototypes, and updates `.gitignore`.
- Auth: git uses the GitHub CLI credential helper (`gh auth setup-git`, account `yuzservice`). The remote URL no longer embeds a token.
- The old personal access token was revoked by the owner on 2026-10-24.

## 7. Open gaps

- Pre-existing test failures, unrelated to this work: `test_customer_export.py` (3 failed: `.content` on a
  `StreamingHttpResponse`; 1 error: missing fixture `api_client`) and `test_customer_campaigns.py`
  (`test_customer_campaigns_api_and_redemptions`: `assert 0 >= 600000`).
- `campaigns.py` imports `exclude_operator_accounts` but never calls it; internal accounts leave campaign reports only
  through their NULL tier. Left unchanged by rule; needs an owner decision.
- Full backend suite not run (owner rule); targeted suites only.
- Deploy to production with the steps in §3.
- Graphify community labels are stale (`graphify label`); README index pages listed in `00-HOME.md` do not exist.

## 8. Next step

1. Deploy: `update.sh` → `refresh_customer_tiers --force` → `backfill_rfm_snapshots --months 12` (§3).
2. Review the RFM distribution on production data and finalize thresholds; then Stage 2 club audiences.
3. Decide on the pre-existing export/campaign test failures and the unused campaign exclusion.

## 9. Log

### 2026-10-27 — «ساخت پیش‌نویس اینترنتی / حضوری» button (`fix/channel-draft-button`, from `production`)
- Server state (owner, read-only): migration 0007 applied; v1 archived, **v2 active (general), v3 draft (general)**.
  The migration skipped its draft because v3 existed, so the modal had no way to reach channel mode.
- Added `build_channel_rules_from()` (tier_rules.py; migration file untouched), `create_channel_draft()` and
  `POST /api/customers/tier-rules/channel-draft/` (super admin; 400 channel active, 409 draft exists without `replace_draft`,
  otherwise old draft archived + channel draft from the active version). Modal banner with confirm over a general draft.
- Tests: `test_tier_channels.py`, `test_customer_tier_rules.py`, `test_customer_tiers.py`, `test_operator_accounts.py`,
  `test_customer_list.py`, `test_customer_360.py`, `test_customers.py`: 112 passed. Frontend: `tsc -b` OK, Vitest 46/46, build OK.
- Released: merged into `production` as `3f5de33` (pushed; 112 passed, `tsc -b` OK, Vitest 46/46, build OK) and then into `main`.
- Next (owner): run `update.sh` → open the modal, press the banner button (confirm archiving v3), preview, activate.

### 2026-10-27 — Channel tiers released to `production` and merged into `main`
- `production`: `git merge --no-ff feature/tier-channels` → `1400d6b`, pushed. Targeted tests on `production`:
  110 passed; frontend `tsc -b` OK, Vitest 43/43, build OK.
- `main`: merged `production`. Resolutions: internal accounts stay excluded by customer id (main) and
  `clear_operator_tiers` also clears `tier_channel`; `/api/customers/tiers/` returns channel groups and each tier keeps
  its `customers` count; list rows / 360 carry `tier_channel` next to RFM and internal-account fields; the list keeps
  main's RFM column (no tier filter grid); the club page («باشگاه مشتریان») groups tier population by channel.
  Merge migration `0010_merge_tier_channels` (0007_tier_channels + 0009_seed_confirmed_internal_accounts);
  `makemigrations --check`: no changes. `test_tier_channels.py` desk setup now creates an `InternalAccount` row.
- Tests on `main` (`test_tier_channels`, `test_customer_tier_rules`, `test_customer_tiers`, `test_operator_accounts`,
  `test_customer_list`, `test_customer_360`, `test_customers`, `test_customer_rfm`, `test_internal_accounts`,
  `test_internal_accounts_seed`): 183 passed. Frontend: `tsc -b` OK, Vitest 48/48, build OK. Full suite not run.
- Local DB `elinor_iq` not migrated (needs owner approval).


### 2026-10-26 — Channel-based tiers (`feature/tier-channels`, from `production`)
- Branches: `production` = what the server runs (`f308fec` + deploy change `b69af90`); `update.sh` deploys only
  `production`. `main` = development (RFM, internal accounts). Features that ship alone branch from `production`.
- Two tier lists «اینترنتی» / «حضوری» per version; channel = majority of invoices (tie → in-store); conditions use
  all-channel facts. Migration `0007_tier_channels` adds `Customer.tier_channel`, history channel fields, and a
  **draft** channel version (not activated). Modal tabs, preview per channel with «توزیع مشتریان بین کانال‌ها»,
  grouped `/api/customers/tiers/`, `tier_channel` list filter, badges «… · حضوری».
- Production steps (owner): run `update.sh` → migration creates the draft → preview and activate it in the tier
  rules modal → the background refresh writes channels and history.
- Release path: merge into `production` (owner approval) → owner runs `update.sh` → merge `production` into `main`
  with a Django merge migration for the two 0007 leaves.
- Local check on a temporary copy of the dev database (`elinor_iq_channels`, dropped afterwards; `elinor_iq` untouched):
  purchasing customers by channel online 125,659 / in-store 73,621. Draft tiers: online ONLINE_BRONZE_3 98,655,
  ONLINE_BRONZE_2 15,631, ONLINE_SILVER 5,123, ONLINE_GOLD_2 2,274, ONLINE_DIAMOND 2,013, ONLINE_GOLD_1 1,137,
  ONLINE_VIP 442, ONLINE_BRONZE_1 384; in-store BRONZE_3 44,565, BRONZE_2 13,187, SILVER 5,500, GOLD_2 3,925,
  DIAMOND 3,781, GOLD_1 1,359, VIP 883, BRONZE_1 421. **Level changes: 0**; prefix/channel mismatches: 0.
  About 8,715 customers move from campaign codes (VIP, DIAMOND, GOLD_1, SILVER) to ONLINE_ codes on activation.
- Tests: `test_tier_channels.py`, `test_customer_tier_rules.py`, `test_customer_tiers.py`, `test_operator_accounts.py`,
  `test_customer_list.py`, `test_customer_360.py`, `test_customers.py`: 110 passed. Frontend: `tsc -b` OK, Vitest 43/43, build OK.

### 2026-10-25 — Committed and pushed Stage 1 and internal accounts
- Owner approved after local review. `SUSPECTED_MIN_SCORE` raised from 2 to 3 (`test_internal_accounts.py` +
  `test_internal_accounts_seed.py`: 10 passed). Local suspected accounts at ≥ 3: 10 (score 3: 9, score ≥ 4: 1).
- Commits: `a8198d2` (Stage 1, verified alone: 163 backend tests passed, `tsc -b` OK, Vitest 44/44, build OK),
  `a76cdd8` (internal accounts, 0008, 0009), `accb9d8` (prototypes removed). Pushed; ahead/behind 0/0.
- `graphify update .` run: graph built from `accb9d8`.


### 2026-10-25 — Confirmed internal accounts registered (uncommitted)
- Migration 0009 seeds the 15 owner-confirmed accounts (6 staff, 9 desk; the desk row from 0008 kept as is).
  Movement reads exclude active internal accounts; snapshot history is kept. `refresh_customer_tiers --force` now also refreshes RFM.
- Local before → after: active internal accounts 1 → 15; RFM purchasing 199,280 → 199,266; tiered customers
  199,280 → 199,266 (VIP 1,402 → 1,397, DIAMOND 5,807 → 5,805, GOLD_1 2,463 → 2,460, BRONZE_3 142,855 → 142,851, others unchanged);
  segments champions 4,129 → 4,122, loyal 7,555 → 7,553, cant_lose 3,950 → 3,945, others unchanged; suspected 213 → 200.
  Sales for 2025-09-23..2025-10-23 unchanged (online 5,018 orders / 6,761,406,550; POS 13,138 sales; purchase_count 18,156);
  buyer count 12,727 → 12,717.
- Tests: `test_internal_accounts_seed.py`, `test_internal_accounts.py`, `test_operator_accounts.py`, `test_customer_tiers.py`,
  `test_customer_rfm.py`: 121 passed. Full backend suite not run (owner rule).


### 2026-10-25 — RFM Stage 1, club menu and internal accounts (uncommitted)
- RFM Stage 1: `rfm.py` (facts from the tier CTE with as_of and 12-month columns, fixed thresholds, 8 segments),
  `customer_rfm` + `customer_rfm_snapshots` (migration 0007), daily refresh after tiers, monthly Jalali snapshots,
  `backfill_rfm_snapshots`, `GET /api/customers/rfm/summary/`, list/export filters and `sort=rfm`, Customer 360 RFM block;
  frontend «گزارش RFM» tab, «لیست مشتریان» rework, `/club` page (tiers + campaigns), RFM card in 360.
- Step-0 distribution (local data, purchasing non-internal customers = 199,280; registered without purchase = 74,022):
  R5..R1 = 2,121 / 23,035 / 30,990 / 49,658 / 93,476; F5..F1 = 10,263 / 11,364 / 13,725 / 32,252 / 131,676;
  M5..M1 = 1,870 / 6,069 / 16,524 / 40,449 / 134,368. R×F rows (F5..F1): R5 507/266/221/318/809, R4 3,356/2,526/2,307/4,000/10,846,
  R3 2,450/2,579/2,816/5,733/17,412, R2 1,671/2,638/3,462/8,421/33,466, R1 2,279/3,355/4,919/13,780/69,143.
- Payment filter «سایر» = purchasers who never paid with SnappPay or DigiPay (owner decision).
- Internal accounts: `InternalAccount` (migration 0008 moved the desk mobile), `operators.py` reads the table and
  excludes by customer id, signals scored in the RFM refresh, management API, 360 banners/menu/dialog, list filter.
  Local suspected counts: score 2 = 194, 3 = 13, 4 = 6 (213 total); score 1 = 1,854. Fired signals among suspected:
  high_frequency 195, same_day_burst 202, many_cities 34, many_receivers 20, many_branches 0. p99.5 of 12-month purchases = 9.
- Tests (targeted: `test_customer*.py`, `test_customers.py`, `test_operator_accounts.py`, `test_internal_accounts.py`, `test_sales_*.py`, `test_api.py`): 199 passed, 5 failed, 1 error in 9m47s. Failures: the 4 pre-existing export failures + 1 error and the pre-existing campaign failure, plus `test_api.py::test_customer_list_is_paginated` (old `"rfm" not in` 360 assertion) which was then updated: `test_api.py` 2 passed. Frontend: `tsc -b` OK, Vitest 45/45, `npm run build` OK.
  **Full backend suite not run (cancelled by owner); targeted suites only.**
- Older tests that asserted "no RFM in 360" and that created the desk account by mobile were updated (decisions 0003, 0004).


### 2026-10-24 — Tier rules: Phase 1, Amendment A and Correction
- Phase 1: versioned tier thresholds, preview with samples, background activation in one transaction, advisory-locked writers, `customer_tier_history`. 79 backend tests passed; Vitest 34/34; build OK. Owner applied 0006 to the local DB; live counts under version 1 matched stored tiers exactly (199,280 tiered customers, 199,280 baseline rows).
- Amendment A + Correction: ordered/custom tiers (`{"tiers": [...]}`), server-issued `CUSTOM_<n>` codes, gte/lte for count and amount, days upper-bound only, titles from versions with history snapshots, `GET /api/customers/tiers/`, preview warnings (unmatched, held, campaign, empty), modal on the Customers page, dynamic tier options/badges. Migration 0006 rewritten in place (only local + test DBs had it).
- Tests: `test_customer_tier_rules.py` + `test_customer_tiers.py` + `test_operator_accounts.py` + `test_customer_list.py` + `test_customer_360.py`: 90 passed (re-run before commit). Frontend: `tsc -b` OK, Vitest 38/38, `npm run build` OK. Full backend suite: not completed.
- Local DB: rewritten 0006 rolled back and re-applied with approval; parity with stored tiers verified. Owner checked the modal and list locally: no bugs. Committed and pushed on owner request.
- Baseline before this work (customer suites): 56 passed, 4 failed, 1 error (export and campaigns, see §3).


### 2026-10-24 — Orientation and handoff created
- Read `CLAUDE.md`, `docs/00-HOME.md`, MODULE_REGISTRY `## 3.`, FEATURE_MATRIX (RFM/360 rows), `elinor-context` skill.
- Verified Graphify MCP access; graph matches HEAD.
- Created this file; added shared-workspace rules and verified git/backup state. Linked from `docs/00-HOME.md`. Committed docs and CLAUDE.md collaboration rules; removed the embedded token from the remote URL; pushed `main` to `origin` (`793edcd..494e3f4`). No code, migrations or tests touched or run.
