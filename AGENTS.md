# ELINOR IQ V2: rules for every AI assistant and engineer

This file is the single source of project rules for any tool (Codex, Claude, Cursor, a person). `CLAUDE.md` only points here.
Knowledge lives in this repo, not in chat history or account memory.

Internal retail intelligence platform for Elinor Boutique. Persian RTL UI.
Read-only ingestion from the Elinor API and historical MariaDB dumps into PostgreSQL.

## Start here
1. This file.
2. `docs/handover/HANDOFF.md`: «Start here» block, current work, open items.
3. `docs/process/context-loading.md`: pick one module, then read its `## N.` section in `docs/modules/MODULE_REGISTRY.md`.
4. `docs/process/ai-workflow.md`: roles, cycle, branches, testing.

## Stack (verified from source)
- Backend: Django 5.1.7, DRF 3.15.2, Gunicorn, PostgreSQL 16 (psycopg 3.2.6), jdatetime. Python 3.10+.
- Frontend: React 18.3, TypeScript 5.6, Vite 5.4, Tailwind 3.4, React Router 6.28, jalaali-js.
- Runtime: Docker Compose services `postgres`, `backend`, `frontend`, `nginx`, `scheduler`, `pulse-scheduler`.
- Tests: pytest + pytest-django (needs PostgreSQL, so run inside the `backend` container), Vitest.

## Active modules (`backend/config/settings.py` INSTALLED_APPS)
| Area | Backend | Frontend |
|---|---|---|
| Accounts & Auth | `apps/accounts` | `pages/LoginPage.tsx` |
| Core & Executive Dashboard | `apps/core` | `pages/HomePage.tsx` |
| Customers & Loyalty | `apps/customers` | `pages/CustomersPage.tsx`, `Customer360Page.tsx` |
| Sales & Payments | `apps/sales` | `pages/SalesPage.tsx` |
| Products & Merchandising | `apps/products` | `pages/ProductsPage.tsx`, `Product360Page.tsx` |
| Call Center | `apps/calls` | `pages/CallCenterPage.tsx` |
| Elinor Pulse (Instagram, behind `PULSE_ENABLED`) | `apps/pulse` | `pages/PulsePage.tsx` |
| System & Operations | `apps/system` | `pages/SettingsPage.tsx` |
| Data Sync / Integrations | `apps/integrations/elinor` | Settings sync panel |

**Retired: Smart Direct** (commit `3bc0a48`). `backend/apps/smart_direct/` keeps only `models.py` and `migrations/` for the
existing tables; it is not installed or routed. Do not re-add it or build on it. `docs/SMART_DIRECT_INSTAGRAM.md` is historical.

## Documentation entry points (open only what the task needs)
- `docs/00-HOME.md`: index.
- `docs/modules/MODULE_REGISTRY.md`: files, models and APIs per module (read one `## N.` section, not the whole file).
- `docs/architecture/SYSTEM_OVERVIEW.md`: topology, ingestion, known risks (section 8).
- `docs/implementation-status/FEATURE_MATRIX.md`: verification status per feature.
- `docs/business-rules/`, `docs/decisions/`: rules and product decisions.
- `docs/design/README.md`: reference prototypes and their status.
- `docs/runbooks/`: Pulse first deploy (`pulse-first-deploy.md`), backup and restore (`backup.md`).
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`: generated dependency graph. Never read `graphify-out/graph.json` whole.

## Search rules
- Search by exact symbol, path or endpoint (`grep -rn`), scoped to `backend/apps/<module>` or `frontend/src`.
- Always exclude `node_modules`, `dist`, `.venv`, `graphify-out*`, `source/`, `backups/`, `.agents`, `.cursor`.
- Read file ranges, not whole large files, when the target is known. Do not explore the whole repository.

## Financial and data-integrity guardrails
- Online orders and POS sales have different accounting shapes. Never sum `Order.total_amount` with POS tender columns.
  Every revenue figure goes through `apps/sales/semantics.py` (`qualifying_online_orders()`, `qualifying_pos_sales()`,
  `qualifying_online_items()`, `qualifying_pos_items()`). Line revenue = `amount × quantity` for both channels.
- POS history starts 2025-05-31; online history starts 2022-01-12. Do not compare channels before mid-2025; show «—»
  where a comparison range lacks history.
- The Elinor API is read-only. Respect the client rate limit (`ELINOR_RATE_LIMIT_PER_MINUTE`, default 45).
- Sync and import stay idempotent (`source_id` uniqueness, `PosDaySync` day tracking).
- Campaign and gift reports follow `apps/customers/campaigns.py`; do not infer eligibility from tiers.
- `Variant.quantity` is not populated: never report stock balances. The only stock shown is central-warehouse
  `main_balance` (`product_central_stock`), labelled central only. There is no branch stock.
- Internal (desk/staff) accounts stay in sales totals and are excluded as buyers (`apps/customers/operators.py`).
- Never change currency units, rounding, date boundaries (Jalali/Gregorian, Tehran time) or tier logic without reading their tests first.
- No destructive migrations, table drops or production data edits without explicit owner approval. Migrations are additive.

## Working rules
- Implement nothing without explicit owner approval. Preserve existing business semantics unless a change is authorized.
- Read the relevant source before changing behaviour. Verify a file exists before citing it. Code wins over docs; report mismatches.
- If the code or real data contradicts a request, report what differs and propose; do not follow blindly.
- Check `git status` before editing. Preserve unrelated changes. Never reset, clean or stash; commit and push only when authorized.
- Never read or print `.env`, secrets, backups, `source/` dumps or real customer records unless the task requires it.
  Check a secret only by length (`printf %s "$VAR" | wc -c`). Report aggregates only, never customer or personal data.
- Never commit credentials, production data, customer data, `backups/` content, `graphify-out/.graphify_labels.pending.json`
  or dated `graphify-out/<date>/` folders.
- Never run anything on the production server; give the owner the commands.
- Never claim tests, type checks or builds passed unless they ran in this session. Paste failures verbatim.
  Label claims as verified [V] or assumed [A].
- After meaningful code changes update the module's MODULE_REGISTRY section, FEATURE_MATRIX row, business rules, and HANDOFF.
  Record product decisions in `docs/decisions/` (next number) and rules in `docs/business-rules/`.
- Run `graphify update .` only when asked; propose it after significant structural changes.
- Report git state exactly: branch, hash, pushed or not (ahead/behind `origin`), what is uncommitted.

## Testing
- Targeted test files only, one file at a time with a timeout, inside the container:
  `docker compose exec -T backend timeout 120 python -m pytest tests/<file>.py -q`.
- The full backend suite hangs: `test_customer_campaigns.py` and `test_details_sync.py` call the real Elinor API.
- Frontend: `cd frontend && npx tsc -b && npx vitest run <path>`.
- Known failures unrelated to recent work (check before blaming a change): `test_customer_export.py`, `test_gateway_payments.py`,
  and `src/lib/theme.test.ts` when Node has no `localStorage`.
