# Project Handoff — Elinor IQ V2

Durable state for the next engineer or AI assistant. Do not rely on chat history; this file plus the repo is the source of truth.
Update this file at the end of every implementation task (newest entry first in the Log).

Last updated: 2026-10-24 · HEAD `494e3f4` (branch `main`, pushed)

## 1. Current priority

**Customer RFM and Customer 360.** Requirements and specs come from the Product Architect session.
The engineer implements only explicitly approved tasks.

Out of scope until approved:
- Loyalty Rules Settings page.
- Any redesign of customer tiers.
- Smart Direct (retired in `3bc0a48`; do not rebuild).

## 2. Workflow

1. Read `CLAUDE.md`, then use the `elinor-context` skill to pick one module.
2. Read that module's `## N.` section in `docs/modules/MODULE_REGISTRY.md` and the source files it names.
3. Use Graphify MCP (`.mcp.json` → `graphify-out/graph.json`) only for cross-module impact. Verify against source.
4. Present a plan and wait for explicit authorization before editing.
5. Run the module's tests (backend tests need PostgreSQL via Docker Compose).
6. Update module docs and this file. No commit/push unless asked.

## 3. State of the RFM / Customer 360 area (verified by reading docs and graph, not by running tests)

| Feature | Source | Tests | Status |
|---|---|---|---|
| Exclusive tier engine (VIP, DIAMOND, GOLD_1/2, SILVER, BRONZE_1/2/3) | `backend/apps/customers/tiers.py` (`tier_code_for`, `refresh_stored_tiers`), `tier_refresh.py` | `backend/tests/test_customer_tiers.py` | Implemented; tests not run in any recorded session |
| Customer 360 | `backend/apps/customers/detail.py` (`customer_360_payload`), `frontend/src/pages/Customer360Page.tsx` | `test_customer_360.py`, `customer360Display.test.ts` | Implemented; tests not run in any recorded session |
| Tier refresh API | `POST /api/customers/refresh-tiers/` | — | Implemented |

Notes for the Product Architect / next task:
- `detail.py` module docstring states Customer 360 is "Not a revenue, VIP, RFM, or CLV layer." Adding RFM to 360 changes that contract; the spec should say so explicitly.
- `Customer.tier_code` stores the computed tier; operator desk accounts are excluded from tiering.
- Revenue figures must use `apps/sales/semantics.py` qualifiers; never mix online `Order.total_amount` with POS tenders.

## 4. Knowledge infrastructure

| Item | Location | State |
|---|---|---|
| Project rules | `CLAUDE.md` | Present |
| Context skill | `.claude/skills/elinor-context/SKILL.md` | Present |
| Docs index (Obsidian vault root) | `docs/00-HOME.md` | Present |
| Module registry | `docs/modules/MODULE_REGISTRY.md` | Present |
| Architecture / risks | `docs/architecture/SYSTEM_OVERVIEW.md` (section 8) | Present |
| Feature verification | `docs/implementation-status/FEATURE_MATRIX.md` | Present; most tests `NOT_RUN` |
| Graphify graph | `graphify-out/` | Built at `3bc0a488` = HEAD on 2026-10-24; MCP reachable (1506 nodes, 4606 edges, 91 communities) |

## 5. Shared workspace rules

- Two sessions share this local repo. **Product Architect** is read-only by default; **Software Engineer** makes approved code and doc changes.
- Never edit the same file from both sessions at once.
- Git-tracked docs are the source of truth, not chat history or account memory. Keep `CLAUDE.md`, this file, business rules and decisions aligned with the code; do not duplicate docs.
- Commit and push to the approved remote only when explicitly authorized. Verify `git status` and ahead/behind counts; never assume work is backed up.
- Never commit secrets, credentials, database dumps (`source/`, `backups/`) or customer records. `.env` is gitignored.

## 6. Git and backup state (checked 2026-10-24)

- Remote `origin` → GitHub `yuzservice/elinor-iq`.
- `main` = `origin/main` at `494e3f4` (pushed 2026-10-24). Everything committed is backed up on GitHub.
- Tracked docs: `CLAUDE.md`, `docs/`, `.claude/skills/`.
- Still untracked, pending a decision: `.mcp.json`, `.graphifyignore`, `graphify-out*/`, `.agents/`, `.cursor/`, `skills-lock.json`, three `*-prototype*.html` files.
- Auth: git uses the GitHub CLI credential helper (`gh auth setup-git`, account `yuzservice`). The remote URL no longer embeds a token.
- Pending owner action: revoke the old personal access token (prefix `ghp_QGQM`) in GitHub settings, if not already done.
- Graphify graph was built at `3bc0a48`; later commits are docs-only, so code structure in the graph is still current.

## 7. Open gaps

- `docs/business-rules/` is empty: RFM, tier, campaign and gift rules live only in code and tests.
- `docs/decisions/` is empty: no decision log yet.
- README index pages listed as pending in `00-HOME.md` (architecture, modules, implementation-status) do not exist.
- Decide whether to track or gitignore `graphify-out/`, `.mcp.json`, prototypes, `.agents/`, `.cursor/`, `skills-lock.json`.
- No test suite has been run in a recorded session; FEATURE_MATRIX verification columns are unconfirmed.

## 8. Next step

Wait for an approved Customer RFM / Customer 360 implementation task from the Product Architect session.

## 9. Log

### 2026-10-24 — Orientation and handoff created
- Read `CLAUDE.md`, `docs/00-HOME.md`, MODULE_REGISTRY `## 3.`, FEATURE_MATRIX (RFM/360 rows), `elinor-context` skill.
- Verified Graphify MCP access; graph matches HEAD.
- Created this file; added shared-workspace rules and verified git/backup state. Linked from `docs/00-HOME.md`. Committed docs and CLAUDE.md collaboration rules; removed the embedded token from the remote URL; pushed `main` to `origin` (`793edcd..494e3f4`). No code, migrations or tests touched or run.
