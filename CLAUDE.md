# ELINOR IQ V2

Internal retail intelligence platform for Elinor Boutique. Persian RTL UI.
Read-only ingestion from the Elinor API and historical MariaDB dumps into PostgreSQL.

## Stack (verified from source)
- Backend: Django 5.1.7, DRF 3.15.2, Gunicorn, PostgreSQL 16 (psycopg 3.2.6), jdatetime. Python 3.10+ required.
- Frontend: React 18.3, TypeScript 5.6, Vite 5.4, Tailwind 3.4, React Router 6.28, jalaali-js.
- Runtime: Docker Compose (nginx, backend, frontend, postgres). Tests: pytest + pytest-django, Vitest.

## Active modules (`backend/config/settings.py` INSTALLED_APPS)
| Area | Backend | Frontend |
|---|---|---|
| Accounts & Auth | `apps/accounts` | `pages/LoginPage.tsx` |
| Core & Executive Dashboard | `apps/core` | `pages/HomePage.tsx` |
| Customers & Loyalty | `apps/customers` | `pages/CustomersPage.tsx`, `Customer360Page.tsx` |
| Sales & Payments | `apps/sales` | `pages/SalesPage.tsx` |
| Products & Merchandising | `apps/products` | `pages/ProductsPage.tsx` |
| System & Operations | `apps/system` | `pages/SettingsPage.tsx` |
| Data Sync / Integrations | `apps/integrations/elinor` | (Settings sync panel) |

**Retired: Smart Direct.** Removed in commit 3bc0a48. `backend/apps/smart_direct/` keeps only `models.py` + `migrations/`
for the existing `smart_direct_*` tables; it is not installed or routed. Do not re-add it or build on it.
SYSTEM_OVERVIEW, MODULE_REGISTRY (`## 8.`) and FEATURE_MATRIX mark it retired; `docs/SMART_DIRECT_INSTAGRAM.md` is historical only.

## Documentation entrypoints (open only what the task needs)
- `docs/00-HOME.md`: index
- `docs/modules/MODULE_REGISTRY.md`: per-module files, models, APIs (read one `## N.` section, not the whole file)
- `docs/architecture/SYSTEM_OVERVIEW.md`: topology, ingestion, known risks (section 8)
- `docs/implementation-status/FEATURE_MATRIX.md`: verification status per feature
- `docs/CORE_HISTORICAL_IMPORT.md`, `docs/SOURCE_DATABASE_DISCOVERY.md`: ETL and upstream schema
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`: generated dependency graph (built from 3bc0a488)

## Progressive context loading
1. Use the `elinor-context` skill for any development task. It selects one module.
2. Read that module's MODULE_REGISTRY section, then the source files it names.
3. Use Graphify wiki pages only to trace cross-module dependencies. Never read `graphify-out/graph.json` whole.
4. Do not explore the whole repository. Do not re-read files already in context.

## Targeted search rules
- Search by exact symbol, path or endpoint with `grep -rn`, scoped to `backend/apps/<module>` or `frontend/src`.
- Always exclude: `node_modules`, `dist`, `.venv`, `graphify-out*`, `source/`, `backups/`, `.agents`, `.cursor`.
- Read file ranges, not whole large files, when the target line is known.

## Financial and data-integrity guardrails
- Online orders and POS sales have different accounting shapes. Never sum `Order.total_amount` with POS tender columns.
  Use `apps/sales/semantics.py` (`qualifying_online_orders()`, `qualifying_pos_sales()`) for every revenue figure.
- POS history starts 2025-05-31; online history starts 2022-01-12. Do not compare channels before mid-2025.
- Elinor API is read-only. Respect the client rate limit (`ELINOR_RATE_LIMIT_PER_MINUTE`, default 45).
- Sync and import must stay idempotent (`source_id` uniqueness, `PosDaySync` day tracking).
- Campaign and gift reports: follow the existing rules in `apps/customers/campaigns.py`; do not infer eligibility from tiers.
- `Variant.quantity` is not populated. Do not report stock balances.
- Never change currency units, rounding, date-boundary (Jalali/Gregorian) or tier logic without reading its tests first.
- No destructive migrations, table drops or production data edits without explicit user approval.

## Working rules
- Read the relevant source before changing behavior. Verify a file exists before citing it.
- Preserve unrelated Git changes. Do not reset, clean, stash or commit unless asked.
- Do not read `.env`, secrets, backups, `source/` dumps or real customer records unless the task requires it.
- Never claim tests, typechecks or builds passed unless they were actually run in this session. Report failures verbatim.
- Backend tests require PostgreSQL (Docker Compose). Say so when they cannot run.
- After meaningful code changes, update the affected module docs. Run `graphify update .` only when asked.

## AI Collaboration, Shared Workspace & Knowledge Preservation
**Two sessions, one local repo**
- Product Architect: analysis, requirements, business rules, UI/UX and implementation specs. Read-only by default.
- Software Engineer: approved implementation, testing and documentation.
- Never edit the same file from both sessions at the same time.

**Account-independent knowledge**
- Git-tracked code and Markdown docs are the durable source of truth. Knowledge must survive changes of Claude account, machine or AI assistant.
- Never rely solely on conversation history or account-specific memory.

**Graphify and Obsidian**
- Use Graphify MCP selectively for structure and dependencies; verify critical findings against source.
- After significant structural code changes, propose `graphify update .` so artifacts stay current.
- Obsidian (vault root `docs/00-HOME.md`) organizes Markdown knowledge; it is not an automatic AI memory.

**Documentation continuity**
- `docs/handover/HANDOFF.md` is the project handoff: current status, completed work, active priorities, key decisions, known issues, next steps. Keep it concise and update it after every task.
- Keep architecture, module and business-rule docs consistent with the code. Extend existing docs; do not duplicate them.
- Record product decisions in `docs/decisions/` and business rules in `docs/business-rules/`, not only in chat.

**Git and backups**
- Check `git status` before editing. Commit and push only with explicit authorization.
- Verify remote backup state (ahead/behind `origin`) instead of assuming work is saved.
- Never commit credentials, secrets, production database contents or customer data.

**Execution safeguards**
- Implement nothing without explicit approval. Preserve existing business semantics unless a change is authorized.
- Verify completed changes and test results. Label every claim as verified or assumed.
