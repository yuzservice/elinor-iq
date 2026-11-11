# How this project is run (any AI tool or person can continue from here)

Rules: [AGENTS.md](../../AGENTS.md). State: [HANDOFF](../handover/HANDOFF.md). Context loading: [context-loading.md](context-loading.md).

## Two roles on one repository
- **Product Architect:** analysis, requirements, business rules, prototypes, implementation prompts, and review of the
  engineer's report against the code. Read-only: never edits code.
- **Software Engineer:** implements approved prompts, tests, documents, commits and pushes the feature branch.
- Both work in the same local repo. Never edit the same file from both sessions at the same time.
- The owner decides. Nothing is implemented, merged or deployed without the owner's explicit approval.

## Cycle
1. Idea from the owner.
2. Architect builds an HTML prototype with sample data.
3. Owner reviews the prototype.
4. Architect writes the implementation prompt **only when the owner asks with «پرامپت بده»**:
   - prompt in English, all UI text in Persian;
   - pasted in full in chat, never summarized or attached.
5. Engineer implements, then reports: files, migrations, timings, verbatim test output, screenshots, differences from the reference.
6. Architect reviews the report against the code.
7. Owner reviews locally.
8. On the owner's go, the engineer merges and reports the merge SHAs.
9. Owner updates the server.

## Implementation rules
- The first step of every implementation prompt copies its reference prototype into `docs/design/` and adds a row to
  `docs/design/README.md`. The prototype is the source of truth for layout and copy; its data is sample only.
- Work on a feature branch. After each numbered step: commit, push the feature branch, and add 2–3 lines to `HANDOFF.md`.
- Never merge without the owner's approval.
- If the code or real data contradicts the prompt, report it and propose; do not follow blindly.

## Testing
- Targeted test files only, run one file at a time with a timeout inside the container:
  `docker compose exec -T backend timeout 120 python -m pytest tests/<file>.py -q`.
- Do not run the full backend suite: it hangs on tests that call the real Elinor API (`test_customer_campaigns.py`,
  `test_details_sync.py`).
- Frontend: `npx tsc -b`, then `npx vitest run <path>`.
- Report output verbatim, and mark failures that existed before the change.

## Branches and release
- `production` = what the server runs; `update.sh` deploys only `origin/production`. `main` = development.
- Features branch from `production`. After owner review: merge the feature into `production` (`--no-ff`), then `production`
  into `main` (`--no-ff`). Push both and report both SHAs.
- Server update (owner runs it; assistants never run commands on the server):
  `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/production/update.sh)"`.
  Then, in `/opt/elinor-iq`, check that `git log -1 --oneline` matches the reported `production` SHA.
- Some features need a one-time command after the update; the feature's HANDOFF entry names it
  (for example `docker compose exec backend python manage.py products_daily`).

## Deferred items to remember
- **Pulse stock alerts** wait until Elinor IQ has branch stock. The owner will request a warehouse API from the vendor:
  receipts, transfers, manual adjustments, and current balance per warehouse (see `docs/SOURCE_STOCK_DISCOVERY.md` on
  branch `docs/stock-discovery`). Until then only central-warehouse `main_balance` is available.
- Pulse: include `.sm.jpg` covers in export and import; add `timeout 1800` around the image build in `update.sh`.
