# Context loading: pick one module, read narrowly, verify for real

Tool-neutral procedure for any development task, bug fix, review or question. Rules: [AGENTS.md](../../AGENTS.md).
Never load all documentation at once. Never read `graphify-out/graph.json` whole.

## 1. Identify the module

Map the request to one row. Pick a second row only if the change crosses modules.

| Module | Request keywords | MODULE_REGISTRY section | Backend | Frontend | Tests (`backend/tests/`) |
|---|---|---|---|---|---|
| Sales & Payments | revenue, KPI, order, POS, tender, gateway, channel | `## 4.` | `apps/sales` | `pages/SalesPage.tsx` | `test_sales_*`, `test_gateway_payments.py` |
| Data Sync / Integrations | sync, import, ETL, Elinor API, dump, hourly | `## 7.` | `apps/integrations/elinor` | `pages/SettingsPage.tsx` | `test_sync.py`, `test_pos_sync*.py`, `test_details_sync.py`, `test_import_core.py`, `test_elinor_client.py`, `test_customer_sync.py` |
| Customers & Loyalty | customer, tier, list, 360, campaign, gift, wallet, export, internal account | `## 3.` | `apps/customers` | `pages/CustomersPage.tsx`, `pages/Customer360Page.tsx` | `test_customer*.py`, `test_customers.py`, `test_internal_accounts*.py` |
| Products & Merchandising | product, variant, category, stock, bundle, size, colour | `## 5.` | `apps/products` | `pages/ProductsPage.tsx`, `pages/Product360Page.tsx` | `test_categories.py`, `test_product_daily.py`, `test_product_report.py`, `test_product_360.py`, `test_products_and_coverage.py` |
| Call Center | call, list, program, agent, task, form | `## 10.` | `apps/calls` | `pages/CallCenterPage.tsx`, `features/calls/` | `test_call_center.py` |
| Elinor Pulse | Instagram, post, reel, cover, brief | `## 11.` | `apps/pulse` | `pages/PulsePage.tsx`, `features/pulse/` | `test_pulse*.py` |
| Accounts & Auth | login, role, permission, user, super admin | `## 1.` | `apps/accounts` | `pages/LoginPage.tsx`, `services/auth.ts` | `test_auth.py`, `test_accounts_users.py`, `test_operator_accounts.py`, `test_platform_access.py` |
| Core & Executive Dashboard | home, overview, health, coverage notice | `## 2.` | `apps/core` (`home_metrics.py`, `metrics.py`) | `pages/HomePage.tsx` | `test_health.py`, `test_sales_overview.py`, `test_api.py` |
| System & Operations | settings, sync trigger, diagnostics, credentials, Docker, deploy | `## 6.` | `apps/system`, `docker/`, `*.sh` | `pages/SettingsPage.tsx` | `test_platform_access.py` |

Shared frontend: `frontend/src/layouts/`, `frontend/src/types/index.ts`, `frontend/src/services/`, `frontend/src/lib/` (`## 9.`).
Smart Direct is retired (commit `3bc0a48`). If a request touches it, stop and ask the owner.

## 2. Read module docs only
1. Only the matching section of `docs/modules/MODULE_REGISTRY.md`: grep for its `## N.` heading, then read that range.
2. The module's rules in `docs/business-rules/` and related records in `docs/decisions/`.
3. For money, dates or sync, also `docs/architecture/SYSTEM_OVERVIEW.md` section 8 (known risks).

## 3. Trace dependencies only when useful
Use the dependency graph only when the change may affect other modules:
- `grep -n "<symbol>" graphify-out/wiki/index.md`, then open that one wiki page.
- Check "Graph Freshness" in `graphify-out/GRAPH_REPORT.md`; if its commit is older than `git rev-parse HEAD`, treat it as stale.

## 4. Verify the actual source
- Open the source files named in the registry section. Confirm functions, fields and endpoints exist before relying on them.
- Docs can lag behind code. Code wins; note any mismatch.

## 5. Name the risks before editing
State which apply:
- Online vs POS revenue mixing (use `apps/sales/semantics.py`).
- Date boundaries: Jalali/Gregorian, Tehran time, inclusive day ends.
- Sync idempotency (`source_id` uniqueness, `PosDaySync`).
- Tier, campaign or gift eligibility rules in `apps/customers`.
- API contract changes that need frontend types and service updates.
- Migrations: additive only; never drop tables or edit production data without explicit approval.

## 6. Test narrow, then broad
1. The module's test files, one at a time: `docker compose exec -T backend timeout 120 python -m pytest tests/<file>.py -q`.
2. Frontend touched: `cd frontend && npx tsc -b && npx vitest run <path>`.
3. Broader runs only if shared code changed and the owner asks. The full backend suite hangs on tests that call the real Elinor API.
- Backend tests need PostgreSQL (Docker Compose). If unavailable, say so; never substitute results.

## 7. Update docs
After a meaningful behaviour change: the module's MODULE_REGISTRY section, its FEATURE_MATRIX row, business rules, and HANDOFF.
Do not run `graphify update .` unless asked.

## 8. Report
- Files changed; commands actually run, with pass/fail counts; checks not run and why.
- Git state: branch, hash, pushed or not.
- Remaining uncertainty and doc mismatches.
