---
name: elinor-context
description: Load only the context an Elinor IQ V2 development task needs. Use for any change, bug fix, review or question about Elinor IQ sales, payments, sync, customers, loyalty, campaigns, products, auth, dashboard or system settings.
---

# elinor-context

Pick one module, read its docs and source, change narrowly, verify for real.
Never load all documentation at once. Never read `graphify-out/graph.json` whole.

## 1. Identify the module

Map the request to one row. Pick a second row only if the change crosses modules.

| Module | Request keywords | MODULE_REGISTRY section | Backend | Frontend | Tests (`backend/tests/`) |
|---|---|---|---|---|---|
| Sales & Payments | revenue, KPI, order, POS, tender, gateway, channel | `## 4.` | `apps/sales` | `pages/SalesPage.tsx` | `test_sales_*`, `test_gateway_payments.py` |
| Data Sync / Integrations | sync, import, ETL, Elinor API, dump, hourly | `## 7.` | `apps/integrations/elinor` | `pages/SettingsPage.tsx` | `test_sync.py`, `test_pos_sync*.py`, `test_details_sync.py`, `test_import_core.py`, `test_elinor_client.py`, `test_customer_sync.py` |
| Customers & Loyalty | customer, tier, RFM, 360, club, campaign, gift, wallet, export | `## 3.` | `apps/customers` | `pages/CustomersPage.tsx`, `pages/ClubPage.tsx`, `pages/Customer360Page.tsx` | `test_customer*.py`, `test_customers.py` |
| Products & Merchandising | product, variant, category, color, size, bundle | `## 5.` | `apps/products` | `pages/ProductsPage.tsx` | `test_product_intelligence.py`, `test_products_and_coverage.py` |
| Accounts & Auth | login, role, permission, user, super admin | `## 1.` | `apps/accounts` | `pages/LoginPage.tsx`, `services/auth.ts` | `test_auth.py`, `test_operator_accounts.py`, `test_platform_access.py` |
| Core & Executive Dashboard | home, overview, health, coverage notice | `## 2.` | `apps/core` (`home_metrics.py`, `metrics.py`) | `pages/HomePage.tsx` | `test_health.py`, `test_sales_overview.py`, `test_api.py` |
| System & Operations | settings, sync trigger, diagnostics, credentials, Docker, deploy | `## 6.` | `apps/system`, `docker/`, `*.sh` | `pages/SettingsPage.tsx` | `test_platform_access.py` |

Shared frontend: `frontend/src/layouts/`, `frontend/src/types/index.ts`, `frontend/src/services/`, `frontend/src/lib/` (`## 9.`).

Smart Direct is retired (commit 3bc0a48). If a request touches it, stop and ask the user.

## 2. Read module docs only

1. Read only the matching section of `docs/modules/MODULE_REGISTRY.md`: grep for its `## N.` heading, then read that range.
2. Read business rules for the module if they exist in `docs/business-rules/` (customer tiers: `customer-tiers.md`, RFM: `customer-rfm.md`) and related records in `docs/decisions/`.
3. For money, dates or sync, also read `docs/architecture/SYSTEM_OVERVIEW.md` section 8 (known risks).

## 3. Trace dependencies only when useful

Use Graphify only when the change may affect other modules:
- `grep -n "<symbol>" graphify-out/wiki/index.md`, then open that one wiki page.
- Check `graphify-out/GRAPH_REPORT.md` "Graph Freshness". If the commit is older than `git rev-parse HEAD`, treat graph data as possibly stale.

## 4. Verify the actual source

- Open the source files named in the registry section. Confirm functions, fields and endpoints exist before relying on them.
- Docs can lag behind code. Code wins; note any doc mismatch.

## 5. Name the risks before editing

Check and state which apply:
- Online vs POS revenue mixing (use `apps/sales/semantics.py` qualifiers).
- Date boundaries: Jalali/Gregorian, timezone, inclusive/exclusive day ends.
- Sync idempotency (`source_id` uniqueness, `PosDaySync`).
- Tier, campaign or gift eligibility rules in `apps/customers`.
- API contract changes that require `frontend/src/types/index.ts` and service updates.
- Migrations. Never drop tables or edit production data without explicit approval.

## 6. Test narrow, then broad

1. Run the module's tests: `cd backend && python -m pytest -q tests/<file>.py`.
2. Frontend touched: `cd frontend && npx tsc -b && npx vitest run <path>`.
3. Broader runs only if shared code changed: full `pytest`, `npx vitest run`, `npm run build`.
- Backend tests need PostgreSQL and Python 3.10+ (use Docker Compose). If unavailable, say so. Do not substitute results.

## 7. Update docs

After a meaningful behavior change, update the module's MODULE_REGISTRY section and FEATURE_MATRIX row.
Do not run `graphify update .` unless the user asks.

## 8. Report

- Files changed.
- Commands actually run, with pass/fail counts.
- Checks not run and why.
- Remaining uncertainty and doc mismatches found.
