# Project Handoff — Elinor IQ V2

Durable state for the next engineer or AI assistant. Do not rely on chat history; this file plus the repo is the source of truth.
Update this file at the end of every implementation task (newest entry first in the Log).

Last updated: 2026-10-24 · branch `main`; tier-rules work committed and pushed (see §6)

## 1. Current priority

**Customer RFM and Customer 360.** Requirements and specs come from the Product Architect session.
The engineer implements only explicitly approved tasks.

Done: **Customer Tier Rules** (Phase 1 + Amendment A + Correction), committed and pushed; owner checked the UI locally.
Out of scope until approved: Smart Direct (retired in `3bc0a48`; do not rebuild); changes to `campaigns.py`;
Customer 360 content changes.

## 2. Workflow

1. Read `CLAUDE.md`, then use the `elinor-context` skill to pick one module.
2. Read that module's `## N.` section in `docs/modules/MODULE_REGISTRY.md` and the source files it names.
3. Use Graphify MCP (`.mcp.json` → `graphify-out/graph.json`) only for cross-module impact. Verify against source.
4. Present a plan and wait for explicit authorization before editing.
5. Run the module's tests (backend tests need PostgreSQL via Docker Compose).
6. Update module docs and this file. No commit/push unless asked.

## 3. State of the RFM / Customer 360 area

| Feature | Source | Tests (run 2026-10-24 in Docker) | Status |
|---|---|---|---|
| Tier engine (rule-driven, ordered, first match) | `backend/apps/customers/tiers.py`, `tier_rules.py` | `test_customer_tiers.py`, `test_customer_tier_rules.py` | PASSING |
| Tier rules admin (draft, preview, activation, history) | `tier_rule_admin.py`, views/urls `tier-rules/…`, `tiers/` | `test_customer_tier_rules.py`, `tierRules.test.ts` | PASSING |
| Tier rules modal (Customers page) | `frontend/src/features/customers/TierRulesModal.tsx`, `tierRules.ts`, `tierDisplay.tsx`, `hooks/useTiers.ts` | `tsc -b`, Vitest, `npm run build` | Passing; owner checked it locally, no bugs found |
| Customer 360 | `backend/apps/customers/detail.py`, `frontend/src/pages/Customer360Page.tsx` | `test_customer_360.py`, `customer360Display.test.ts` | PASSING (tier pill now dynamic) |
| Customer export | `export.py` | `test_customer_export.py` | FAILING before this work (3× `.content` on streaming response, 1× missing fixture `api_client`) |
| Campaign report | `campaigns.py` | `test_customer_campaigns.py` | FAILING before this work (`test_customer_campaigns_api_and_redemptions`: `assert 0 >= 600000`) |

Rules and decisions: `docs/business-rules/customer-tiers.md`, `docs/decisions/0001-…`, `0002-…`.

Files of the tier-rules work: backend `tier_rules.py`, `tier_rule_admin.py`, migration `0006_tier_rule_sets.py`,
`tests/test_customer_tier_rules.py`, edits to `tiers.py`, `tier_refresh.py`, `models.py`, `views.py`, `urls.py`, `list_query.py`;
frontend `TierRulesModal.tsx`, `tierRules.ts`, `tierDisplay.tsx`, `hooks/useTiers.ts`, edits to `CustomersPage.tsx`,
`Customer360Page.tsx`, `CustomerListPanel.tsx`, `customerListFilters.ts`, `services/customers.ts`, `types/index.ts`.

**Local database state:** rewritten 0006 is applied to the local dev DB (rolled back and re-applied 2026-10-24 with owner
approval). Version 1 reproduces every stored tier count exactly (199,280 tiered customers, 199,280 baseline rows with titles).
The 0006 reverse step runs `SET CONSTRAINTS ALL IMMEDIATE` so rollback can drop its tables.

Notes for the Product Architect / next task:
- `detail.py` module docstring states Customer 360 is "Not a revenue, VIP, RFM, or CLV layer." Adding RFM to 360 changes that contract; the spec should say so explicitly.
- Operator desk accounts are excluded from tiering.
- Revenue figures must use `apps/sales/semantics.py` qualifiers; never mix online `Order.total_amount` with POS tenders.

## 4. Knowledge infrastructure

| Item | Location | State |
|---|---|---|
| Project rules | `CLAUDE.md` | Present |
| Context skill | `.claude/skills/elinor-context/SKILL.md` | Present |
| Docs index (Obsidian vault root) | `docs/00-HOME.md` | Present |
| Module registry | `docs/modules/MODULE_REGISTRY.md` | Present |
| Architecture / risks | `docs/architecture/SYSTEM_OVERVIEW.md` (section 8) | Present |
| Feature verification | `docs/implementation-status/FEATURE_MATRIX.md` | Present; Customer Master rows re-run 2026-10-24, others `NOT_RUN` |
| Graphify graph | `graphify-out/` (tracked since `b238c21`) | Built at `3bc0a488`; does **not** include the tier-rules modules. Run `graphify update .` when asked |

## 5. Shared workspace rules

- Two sessions share this local repo. **Product Architect** is read-only by default; **Software Engineer** makes approved code and doc changes.
- Never edit the same file from both sessions at once.
- Git-tracked docs are the source of truth, not chat history or account memory. Keep `CLAUDE.md`, this file, business rules and decisions aligned with the code; do not duplicate docs.
- Commit and push to the approved remote only when explicitly authorized. Verify `git status` and ahead/behind counts; never assume work is backed up.
- Never commit secrets, credentials, database dumps (`source/`, `backups/`) or customer records. `.env` is gitignored.

## 6. Git and backup state (checked 2026-10-24)

- Remote `origin` → GitHub `yuzservice/elinor-iq`.
- `main` = `origin/main` after the tier-rules commit (pushed 2026-10-24); verify with `git status -sb`.
- Tracked docs: `CLAUDE.md`, `docs/`, `.claude/skills/`.
- `b238c21` (owner) tracks Graphify artifacts, `.mcp.json`, `.graphifyignore` and the UI prototypes, and updates `.gitignore`.
- Auth: git uses the GitHub CLI credential helper (`gh auth setup-git`, account `yuzservice`). The remote URL no longer embeds a token.
- The old personal access token was revoked by the owner on 2026-10-24.

## 7. Open gaps

- Full backend suite has not completed in a recorded session (two background runs were stopped; the export tests are slow). Run it once with no time limit.
- Pre-existing failures: `test_customer_export.py` (4) and `test_customer_campaigns.py` (1), unrelated to tiers.
- Graphify graph predates the tier-rules modules (`graphify update .` when asked).
- README index pages listed as pending in `00-HOME.md` (architecture, modules, implementation-status) do not exist.

## 8. Next step

1. Run the full backend suite once to completion and record the result.
2. Decide on fixing the pre-existing export and campaign test failures.
3. Later phase (needs a spec): campaigns on historical tiers.

## 9. Log

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
