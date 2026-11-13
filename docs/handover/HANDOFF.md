# Project Handoff — Elinor IQ V2

Durable state for the next engineer or AI assistant. Do not rely on chat history; this file plus the repo is the source of truth.
Update this file at the end of every implementation task (newest entry first in the Log).

## Start here (updated 2026-11-11)
1. Read `AGENTS.md` (rules for every tool), then this file, then `docs/process/context-loading.md` and the
   `docs/modules/MODULE_REGISTRY.md` section for the module at hand. How work is run: `docs/process/ai-workflow.md`.
2. **Current work: products redesign** (`feature/products-redesign`), all steps 0–9 done:
   - category tree, daily product tables, Products page, Product 360, cleanup, docs.
   - Merged on 2026-11-11 into `production` (`44fb072`, then `fa13657`) and `main`.
   - Next: the owner runs `update.sh` on the server, then once `docker compose exec backend python manage.py products_daily`,
     and reviews the pages on real data. Central stock fills through the scheduler.
3. **Open items:**
   - Local online item details are incomplete from 2026-09 (the dev Mac cannot reach the Elinor API).
   - `docs/stock-discovery` branch (`docs/SOURCE_STOCK_DISCOVERY.md`) is pushed but not merged.
   - The Graphify graph was built from `3bc0a48` and is stale.
   - The "Last updated" line below predates the Call Center, Pulse and products work; the Log entries are current.
   - `fix/products-no-stock` (from `production`): stock disabled behind `PRODUCTS_STOCK_ENABLED` (default false); card 3 is
     «رو به رشد», Product 360 shows a 14-day forecast, stock params ignored, no stock API calls. Awaiting owner review; not merged.
4. **Deferred decisions:**
   - Home ideas from the owner (not built): a daily summary to the owner's Telegram group (aggregates only; first check that the
     server can reach Telegram, which may be filtered); «امروز در برابر معمول همین ساعت» with an hourly chart; a role-based
     default home (a branch manager sees their own branch); auto-refresh.
   - Products stock (central and branch) is off until the warehouse API exists; re-enable with `PRODUCTS_STOCK_ENABLED=true`.
   - Pulse stock alerts wait for branch stock (vendor warehouse API: receipts, transfers, manual adjustments,
     balance per warehouse).
   - Pulse `.sm.jpg` in cover export/import, and `timeout 1800` around the build in `update.sh`.
   - Internal accounts stay in product sales (owner, 2026-11-10).

Last updated: 2026-11-02 · **Call Center merged into `production` and `main`; reaches the server on the next `update.sh`** · **Customers overview v3 on `feature/customers-overview` (uncommitted, awaiting owner review)** · **`production` = `3f5de33` (tier rules + «از» + channel-based tiers + channel-draft button), pushed; the server gets it when the owner runs `update.sh`**; `main` is development (see §2 Branches); **RFM/Club reverted on `main` 2026-10-27 (decision 0005)**

## 1. Current priority

**Customers area = production + internal accounts.** Requirements and specs come from the Product Architect session.
The engineer implements only explicitly approved tasks.

- Done and released: Customer Tier Rules (Phase 1 + Amendment A + Correction), «از» day bound, channel-based tiers,
  channel-draft button (`production` = `3f5de33`).
- 2026-10-27: **RFM Stage 1 and the «باشگاه مشتریان» menu were reverted on `main`** (decision 0005; archived on
  `archive/rfm-club-2026-10-27`). Internal (staff/desk) accounts are kept on `main` with new migrations
  `0008_internalaccount` / `0009_seed_internal_accounts` (15 confirmed accounts). Not on `production` yet.
- 2026-10-28: **Customers overview (prototype v3)** implemented on `feature/customers-overview` (from `main`
  `f6cebb2`), uncommitted until the owner reviews it locally. Rules: `docs/business-rules/customer-overview-metrics.md`.
- Out of scope until approved: RFM (reintroduce only with new migrations, decision 0005); internal-account signal
  scoring (paused with RFM); Smart Direct (retired in `3bc0a48`); changes to `campaigns.py`.

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
   - `main` = development. Unreleased work (internal accounts) lives here and is not on the server.
   - A feature that should ship alone branches from `production`, merges into `production` for release, then
     `production` is merged into `main`.
   - Work in progress is parked on its own branch, e.g. `wip/rfm-stage-1b`.
   - Never run anything on the server; the owner runs `update.sh`.

## 3. State of the Customers area

| Feature | Source | Tests | Status |
|---|---|---|---|
| Tier engine + tier rules admin/modal + channel tiers | `tiers.py`, `tier_rules.py`, `tier_rule_admin.py`, `TierRulesModal.tsx` | `test_customer_tiers.py`, `test_customer_tier_rules.py`, `test_tier_channels.py`, `tierRules.test.ts` | PASSING; on `production` |
| Internal (staff/desk) accounts | `operators.py`, `internal_accounts.py`, migrations `0008_internalaccount`, `0009_seed_internal_accounts`, `InternalAccountPanel.tsx` | `test_internal_accounts.py`, `test_internal_accounts_seed.py`, `test_operator_accounts.py` | PASSING; `main` only |
| Customers overview (cards, lenses, compare, tier panel) | `overview.py`, `CustomerOverview.tsx`, `overviewDisplay.ts` | `test_customer_overview.py`, `overviewDisplay.test.ts` | PASSING; `feature/customers-overview`, uncommitted |
| RFM report + club menu | archive branch only | — | REVERTED 2026-10-27 (decision 0005) |
| Customer export | `export.py` | `test_customer_export.py` | FAILING before this work (3× `.content` on a streaming response, 1× missing fixture `api_client`) |
| Campaign report | `campaigns.py` | `test_customer_campaigns.py` | FAILING before this work (`assert 0 >= 600000`) |

**Full backend suite not run (owner rule); targeted suites only.** Latest targeted run: see the Log.

Rules and decisions: `docs/business-rules/customer-tiers.md`, `internal-accounts.md` (`customer-rfm.md` = reverted);
`docs/decisions/0001`–`0006`.

**Local database state (dev only):** customers `0001`–`0006`, `0007_tier_channels`, `0008_internalaccount`,
`0009_seed_internal_accounts` applied; 15 active internal accounts (6 staff, 9 desk), none with a tier. No RFM tables.
Tier rule sets: v1 active (general), v2 draft (channel, recreated by `0007_tier_channels`).

**Production steps when internal accounts are released (not run; needs owner approval to merge into `production`):**
1. `update.sh`; migrations `0008_internalaccount` and `0009_seed_internal_accounts` run when the backend starts.
2. `docker compose exec backend python manage.py refresh_customer_tiers --force` (clears the accounts' tiers).

Notes for the Product Architect / next task:
- `campaigns.py` imports `exclude_operator_accounts` but never calls it; internal accounts drop out of campaign
  reports only through their NULL tier. Left unchanged by rule.
- Reintroducing RFM: new migrations after production's latest, and signal scoring rebuilt on them (decision 0005).

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
- `main`: production (`3f5de33`) + internal accounts, after the RFM/Club revert commit of 2026-10-27 (see Log).
- `feature/customers-overview` (local, from `main` `f6cebb2`): Customers overview v3, uncommitted (2026-10-28).
- `archive/rfm-club-2026-10-27` (= old `main` `4a69c5d`, pushed): RFM Stage 1, club menu, internal accounts with the
  old migrations `0007_customer_rfm` … `0010_merge_tier_channels`. Reference only.
- `wip/rfm-stage-1b` (`d7bb88f`, pushed, untouched): built on the archived migration graph; needs rebasing onto new
  RFM migrations if RFM resumes.
- Uncommitted: `graphify-out/.graphify_labels.pending.json`, `graphify-out/2026-10-25/` (never commit).
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
- Internal accounts are on `main` only; releasing them needs owner approval (steps in §3).
- Graphify community labels are stale (`graphify label`); README index pages listed in `00-HOME.md` do not exist.

## 8. Next step

- Owner: run `update.sh` to deploy the Call Center, then create agents in Settings.
0. Owner: review the Customers overview locally (`feature/customers-overview`), then approve the commit/push.
1. Owner: decide whether to release internal accounts to `production` (§3 steps).
2. Decide on the pre-existing export/campaign test failures and the unused campaign exclusion.
3. Paused: faster server updates (`chore/faster-deploy`, no changes yet).

## 9. Log

### 2026-11-13 — Home v2 and speed pass (`feature/home-v2-performance`, from `production` `766bff9`), checkpoints
- Step 0: reference v2 saved as `docs/design/home-prototype.html` (sha256 3b124b47…, replaces v1); sample data only. Not merged; owner reviews locally.
- Step 1: Home rebuilt to v2: pickers «بازه» (امروز default) / «مقایسه» / «شعبه» in the URL with a range line; four cards → branch table (with «کل الینور») → one «روند فروش» (hourly 0..23 for امروز, future hours faded; dashed comparison markers) → targets (branch-aware) → attention. Fixed: «امروز» compared against the previous 24 h; now the same weekday last week or the same Jalali day last year, up to the same time. Other ranges shift by whole days. `test_home_summary` rewritten (14 with targets file: 20 passed).
- Step 2 speed: `SLOW_API` request log (≥ 300 ms, `apps/core/timing.py`) and Postgres `log_min_duration_statement=500ms`; additive `sales.0007` `sales_daily_summary` (closed days × line: sales, invoices, items, buyer ids; nightly `sales_daily_summary --if-due`, 1.4 s locally) read by Home for closed days (equal to the live path on every tested range); `customers.0014` GIN index on `customer_metrics.product_ids`; pairs answers cached 1 h; Postgres sized for 8 GB in compose; heavy jobs only 02:00–05:00 Tehran; every route lazy (main bundle 487 → 193 kB, gzip 146 → 62 kB).
- Local timings (cold, before → after): home 90 d 279 → 81–114 ms, custom 8 months 615 → 195–221 ms; customer list by category (258 products) 106 → 38 ms query; pairs 12 months 324 ms cold → 1 ms cached. Runbook: `docs/runbooks/performance.md`.
- Step 3: `scheduler` now mounts `docker/scheduler-entrypoint.sh` (run with `/bin/sh`), so scheduler changes need no rebuild; owner then removes the temporary `products_daily` crontab line (runbook). Optional build args `APT_MIRROR`, `PIP_INDEX_URL`, `PIP_TRUSTED_HOST` from `.env` (empty = unchanged); `update.sh` builds under `timeout 1800` and falls back to existing images. Mirror test with curl → 200 in the runbook (goal: Pillow for Pulse).
- Step 4 tests: new `test_home_performance.py` (7: summary table = semantics, idempotent, no today row, home stored = live on 4 ranges, partial-day split, slow-request log only for slow /api/ without query strings); `test_home_summary` 11, `test_sales_targets` 9, `test_customer_list_redesign` 21, `test_product_report` 6; tsc clean; vitest 108 passed, 1 known failure (theme, no localStorage).
- Step 5 docs: `home-and-targets.md` (v2 filters, comparisons, sections, speed), `docs/runbooks/performance.md` (slow-endpoint and slow-SQL commands, Postgres settings, nightly window, crontab removal, mirror test), MODULE_REGISTRY §2.

### 2026-11-12 — Home redesign with sales targets (`feature/home-redesign`, from `production` `401c018`), checkpoints
- Step 0: reference saved as `docs/design/home-prototype.html` (sha256 2bd24581…); sample data only. Not merged; owner reviews locally.
- Step 1: additive `sales.0006` (`sales_targets`, `sales_target_changes` audit). `apps/sales/targets.py`: Jalali month/season/year bounds (Esfand 29/30), progress (expected = elapsed ÷ total days, pace, forecast, required daily, line status ±3 points), copy-from-last-year preview (last year's target, else sales; in-store months before 1404/03/10 left empty). APIs `GET|PUT /api/sales/targets/`, `GET /api/sales/targets/copy-preview/` (super_admin, admin, manager), `GET /api/home/targets/?scope=` (cached 60 s).
- Step 1 UI: Settings «تارگت‌ها» grid (`features/home/TargetsPanel.tsx`), home «تارگت فروش» section (`TargetsSection.tsx`). Removed the hard-coded 3-billion target: `TargetGauge` (home), and the Sales page's in-memory target section, modal, card footer and CSV rows.
- Step 2: Home rebuilt in the reference order (`pages/HomePage.tsx`; `apps/core/home.py`): sync pill, period bar (امروز/۷/۳۰/۹۰/دلخواه, URL state, `JalaliRangePopover`), «امروز تا این لحظه» vs the same weekday last week, trend with dashed comparison, branches, targets, four real cards with sparks and links, «نیاز به توجه» (targets behind, new drivers via additive `products.0004` status log, overdue calls/escalations for call managers, tier drops, failed sync for super admin). `GET /api/home/summary/` 17–228 ms uncached locally, cached 60 s.
- Tier-change fix (customer list «تغییر سطح» and Home): natural changes only (reason daily/sync), same channel only (both empty = same), a move to no tier is not a drop. Local 30-day drops 14,482 → 14,468 (real daily moves, spike of 5,375 on 2026-11-02); rises 2,663. Tests in `test_customer_list_redesign.py`.
- Step 3: removed the old home payload and fake numbers with the page rewrite, `apps/core/home_metrics.py` (only its test used it), `components/dashboard/metricCards.tsx`, `primitives.tsx`, `tokens.ts`, `ChannelMix`, the `HomeSummary`/`HomePeriod` types (callers checked; only `RevenueChart` remains, used by Sales). `test_api` checks the new payload.
- Step 4 timings (local, API, after process warm-up): summary cold 48 ms (today) / 78 (30 d) / 255 (90 d) / 167 (custom month), cached ≤ 1 ms; targets cold 4–40 ms. The first request after a backend restart reached 502 ms (90 d) before the shared attention counts were cached; attention is now cached 60 s, with roles applied per request.
- Step 5 tests: `test_home_summary.py` (7: figures from semantics, internal accounts not buyers, «—» before in-store history, no old payload keys, today vs same weekday, each attention rule, role filtering, agent 403) and `test_sales_targets.py` (9). Home, sales, customer-list and product files pass; known failures unchanged (`test_gateway_payments` 1, vitest theme 1).
- Step 6 docs: `docs/business-rules/home-and-targets.md`, decision 0009, MODULE_REGISTRY §2, FEATURE_MATRIX, customer-list tier-change rule, deferred owner ideas in «Start here».
- Step 7: screenshots at 1440 and 375 px, dark and light, with and without a target (local data; not in the repo). Differences from the reference: the expected-pace marker uses the ink token and is labelled «خط عمودی» (dark in light mode); «امروز» is hourly; partial-target companies name the lines they add up; the demo toggle «نمایش بدون تارگت» is not built. Not merged; owner reviews locally.
- Home tier-drop item limited to drops from the top N tiers per channel (`HOME_TIER_DROP_TOP_N`, default 3, read from the active rules): local count 2,473 (was 14,468 for all tiers). New customer-list param `tier_change_from` (removable chip «تنزل از سطوح») makes the Home link return exactly the counted customers. Tests: `test_home_summary` 10, `test_customer_list_redesign` 21, customer vitest 61.

### 2026-11-10 — Products redesign (`feature/products-redesign`, from `production` `79e1cb8`), checkpoints
- 2026-11-11: merged on the owner's go: `feature/products-redesign` (`98028b7`) → `production` (`44fb072`) → `main`. Server: run `update.sh`, then once `docker compose exec backend python manage.py products_daily`; central stock fills through the scheduler.
- Step 0: references saved as `docs/design/products-prototype.html` (sha256 3998463c…) and `docs/design/product-360-prototype.html` (sha256 e6084528…); source of truth for layout and copy, sample data only. Not merged; owner reviews locally.
- Step 1: shared category tree (`apps/products/categories.py`, `GET /api/products/categories/`, `features/categories/CategoryTreeSelect`): paths, short labels for repeated titles, inactive hidden, descendants. No category endpoint in our Elinor client (API unreachable from the dev Mac); `sync_categories` keeps the tree and product links current from product payloads (local: +2 categories, 284 products relinked, 0 products without a category). Customer list filter `category_ids` (with descendants) on `CustomerMetrics.product_ids`; old `categories` titles map to exact categories (same customers); the older free-text `category` param is unchanged.
- Step 2: additive `products.0003` (product_daily_sales, product_metrics, product_central_stock, product_basket_items_daily, product_basket_pairs_daily). `products_daily --if-due` (categories → daily sales → bundles → metrics, full rebuild, 13.8 s locally) and `refresh_central_stock` (≤150 products per run, `main_balance`, central only) run in the scheduler after the tier/metrics pass. Thresholds: `settings.PRODUCTS_RULES`.
- Step 2 data (local): 781k daily rows (150 MB), 1.71M pair rows (189 MB); totals equal semantics exactly. Online `amount` is per unit (old `intelligence.py` summed it without × qty). Internal accounts are ~34% of online item revenue, so they stay in product sales (operators.py rule); `PRODUCTS_EXCLUDE_INTERNAL_SALES=true` drops them. Owner confirmed keeping them (2026-11-10).
- Step 3: Products page rebuilt (`pages/ProductsPage.tsx`, `features/products/`): URL state, report bar with `JalaliRangePopover`, the category tree and filters, four cards, branch strip, top-10/full sorted paged table with column help and CSV export, bundles. APIs `GET /api/products/summary|table|pairs/` (`apps/products/report.py`) read only the summary tables: 5–140 ms locally, pairs 12 months 358 ms.
- Local data gap (not code): only 14 of 851 online orders since 2026-10-12 have item details locally (details need the API), so local online product sales are incomplete from 2026-09.
- Step 4: Product 360 `/products/:id` (`pages/Product360Page.tsx`, `GET /api/products/<id>/`, `apps/products/product360.py`): header, KPIs, rule-based suggestions (charge need = 28-day speed × lead time − central stock with top variant needs; best branch by branch index; bundle; discount; prospects), tabs sales/size, branches, co-purchase, buyers. 51–221 ms locally.
- Call lists: `POST /api/products/<id>/call-list/` (call managers) uses the call center's `new_list`/`start_fill` + draft `CallProgram` and the page lands on the program's form step. Buyers = filter list `{products: id}`; prospects (category bought in 90 days, never this product, internal accounts out) = fixed list.
- Step 5 cleanup: removed `apps/products/intelligence.py` (Python-loop reports, fixed-threshold statuses, dead-stock alert, hard-coded «پوشاک زنانه»), endpoints `GET /api/products/`, `/products/bundles/`, `/products/size-color/`, `/products/<id>/360/` (only the old page and `tests/test_product_intelligence.py` used them; both removed), old product types and service calls. The old page's fake sell-through, «فعال گردید» alerts, bundling-activation button and top-20% card went with the rewrite.
- Steps 6–8: API timings (local, median of 3): Products page ≤140 ms with filters, Product 360 35–135 ms, pairs ≤348 ms (12 months); every page query is index-backed on the summary tables. Docs: `docs/business-rules/products.md`, decision 0008, MODULE_REGISTRY §5, FEATURE_MATRIX, SYSTEM_OVERVIEW. Next: owner review locally; on the server run `products_daily` once and let `refresh_central_stock` fill (≈150 products per loop).

### 2026-11-09 — Elinor Pulse first deploy preparation (`feature/elinor-pulse`), committed `369c8f0`, merged in `79e1cb8`
- Runbook (Persian) `docs/runbooks/pulse-first-deploy.md`: backup with `pg_dump -Fc`, update with Pulse off, enable, full sync, covers, users, rollback. Owner runs every server step.
- `pulse-scheduler` reuses the `elinor-iq-backend` image; scheduler entrypoints no longer crash when `pip install` fails. `/admin/` creates users with a password and role; `create_user` command (password by prompt). Flag-off suites unchanged; new tests `test_accounts_users.py` (4 passed).
- Local: 308 posts and covers; export `backups/pulse-covers-2026-11-09.tar.gz` (308 files, 135 MB). The 11-06 tarball is no longer in `backups/` (not removed by the engineer); the new one is a superset.

### 2026-11-06 — Elinor Pulse Phase 2.2: media served, small covers (`feature/elinor-pulse`), committed `320c977`, pushed
- Fixed: `backend` mounts `pulse_media:/pulse-media:ro` (covers were invisible to the API). Covers moved into the volume with `pulse_import_covers` (101 ok); duplicate `backups/pulse-media` removed; tarball kept.
- 600 px list copies (`Pillow==11.0.0`, `pulse.0004`): 101 made, avg 55 KB vs 568 KB originals. Lists use `/sm/`, the post sheet the original. Tests: Pulse 52 passed; Vitest 98 passed. Server steps: architecture §16.

### 2026-11-06 — Elinor Pulse covers through the Cloudflare relay (`feature/elinor-pulse`), committed `593a445`, pushed
- Covers only from Instagram's CDN via `PULSE_COVER_RELAY_URL` / `_TOKEN` (token only in a header); Zernio-hosted cover URLs are never downloaded; expired Meta links become `expired` (fallback image). Removed `PULSE_MEDIA_PROXY` and `pulse_refresh_covers`. New: `pulse_fetch_covers`, `pulse_export_covers`, `pulse_import_covers`; status shows ok / pending / failed / expired / skipped and relay errors.
- Real local run: all 101 covers downloaded (65 MB on disk) in one `pulse_sync --full`; export `backups/pulse-covers-2026-11-06.tar.gz` (55 MB, 101 files). Server steps: architecture §15. Tests: Pulse 48 passed; Vitest 98 passed.

### 2026-11-06 — Elinor Pulse Phase 2.1 corrections (`feature/elinor-pulse`), committed `1f671e9`, pushed
- No score for fresh posts in generated text; star = most viewed with raw numbers; weakest and repeat_winner use non-fresh posts of the last 3 days (no repeat within 2 days, `pulse.0003`); same-age day comparison; «ارسال» for shares; clean post names; growth note with the first snapshot date.
- `pulse_sync --full` ran on real data: 101 posts, 21 CSV-only posts became Zernio posts, missing post `DfaQS0sGz4j` (2026-11-06 22:00) imported. `pulse_refresh_covers` added; 101 covers waiting until the Meta links expire around 2026-11-11. Tests: Pulse 44 passed; Vitest 98 passed.

### 2026-11-06 — Elinor Pulse Phase 2 (`feature/elinor-pulse`), committed `e161e14`, pushed
- Gate passed: real `pulse_sync` (79 posts updated, 2 requests) and `pulse_snapshot` (74 posts, date 11-05) locally; 100 posts = 79 Zernio + 21 CSV-only.
- Built: role `content` (`accounts.0004`, choices only), read-only `/api/pulse/` + task toggle, `me.features.pulse`, `/pulse` UI with 4 inner tabs and post/product sheets, rule-based brief and 3 tasks (`pulse_daily_brief`), post-timeline backfill (`pulse_backfill_snapshots`), `pulse.0002`. Tests: Pulse backend 37 passed; frontend 98 passed (full suite). Details and real-data findings: architecture §13.
- Open (needs owner decision): brief sentence 1 compares fresh posts with full days; "weakest non-fresh post of yesterday" never exists; Zernio history starts 11-06, so backfill cannot fill older days.

### 2026-11-06 — Elinor Pulse Phase 0 + Phase 1 (`feature/elinor-pulse`, from `main` `d6e3ba9`), uncommitted
- Architecture proposal `docs/elinor-pulse-architecture.md`: app `apps/pulse`, `ig_` tables, Zernio REST (`https://zernio.com/api`, verified with read-only calls), separate `pulse-scheduler`, `pulse_media` volume, no new dependencies. Parser probe on `posts_100.csv` matches 88 / 137 / 69.
- Server checks: Zernio and `api.elinorboutique.com` reachable, Instagram CDN blocked; owner chose cover option C (wait for Zernio's copy, or `PULSE_MEDIA_PROXY`).
- Phase 1 implemented, uncommitted: `apps/pulse` (8 `ig_` tables, migration `pulse.0001`), 4 `pulse_*` commands, `pulse-scheduler` service + `pulse_media` volume, `tests/test_pulse.py` (16 passed). Local: CSV 100 posts / 88 with codes; 132 of 137 codes matched (unmatched 1042, 1143, 5205, 7685, 9233). First real `pulse_sync` (local, 2026-11-06): 79 posts of the last 30 days updated from Zernio in 3.5 s with 2 requests; codes unchanged (88 / 137); followers 899,508; 79 covers waiting (Meta CDN, no proxy). The 21 older CSV posts (09-29 to 10-05) are outside the 30-day window and keep their CSV numbers.

### 2026-11-04 — Customer 360 redesign (`feature/customer-360-redesign`, from `production`), checkpoints
- Backend: `profile360.py` (value cards with tier-average comparison, purchase rhythm, taste, call header, timeline), `customers/<id>/timeline/`, call cards with stats/tags/purchase/attempt/follow-up, sales-agent redaction (email, national code, full address). Detail for the largest local customer (147 invoices): 474 ms cold, 301 ms warm; customers with 283 and 368 invoices: 175 and 138 ms cold.
- Reference saved as `docs/design/customer-360-prototype.html`. Frontend rebuilt to it (header, cards, taste, lazy tabs: timeline, invoices, product cards, call cards, profile); invoice rows add `payment` and `amount`. Re-timed after that: 356 ms cold / 223 ms warm, timeline 22 ms. Rules: `docs/business-rules/customer-360.md`.
- Not merged; waiting for the owner's local review.

### 2026-11-03 — Customer filter v2 (`feature/customer-filter-v2`, from `production`)
- Panel opens under its button (600 px), bottom sheet on phones; compact dropdowns with ✕ clear, search over 8 items, counts. «استان» + dependent «شهر» by id (old `cities` names still work), «تاریخ عضویت», «تغییر سطح اخیر», «خرید کالای مشخص»; ماه تولد and جنسیت are built but hidden (fill < 5%).
- `CustomerMetrics` gains `province_ids, city_ids, product_ids, birth_month` (`customers.0013`); refresh stays ~9 s. Synced birth dates are Jalali stored as dates. Owner approved; merged into `production`, then `main`. Reaches the server on the next `update.sh`; the daily refresh fills the new metric columns (until then the new filters match nobody).

### 2026-11-03 — Customer filter cleanup (`feature/customer-filter-cleanup`, from `production`)
- One «تاریخ خرید» field (rows: آخرین/اولین خرید + از/تا, at most one row per type); day presets removed from the panel. Old `last_days`/`first_days` and the «غیرفعال ۹۰ روز» preset still work as removable chips. No API change: `last_after/before`, `first_after/before` already existed.
- Every option list is now the shared `MultiSelect` dropdown (search for city, category, size); panel is two columns on desktop. Owner approved; merged into `production`, then `main`. Frontend only; reaches the server on the next `update.sh`.

### 2026-11-02 — Customers list redesign (`feature/customer-list-redesign`, from `production`), checkpoints
- Step 1: `CustomerMetrics` (`customers.0010`), `metrics.py` one-statement refresh after the daily tier pass, `refresh_customer_metrics` (first fill runs itself from the scheduler). Local: 273,705 rows, 30 MB, first fill 9 s, no-change run 4.2 s. Next: list API.
- Step 2: list API on metrics (`dir`, new filters, comma lists, `ids`), `list-summary/`, `list-options/`. Without `dir` the old filters and sorts behave as before. Next: saved views, then UI.
- Step 3: `CustomerListView` (`customers.0011`), list/create/delete per user. Next: UI.
- Step 4: new `CustomerListPanel` and `customerListUrl.ts` (filters, sort, page in the URL); old drawer and `customerListFilters.ts` removed. Not yet checked in the browser. Next: performance on real data.
- Step 5: on real local data the sales-table filters missed the target (city 2.1 s, category 4.7 s), so `CustomerMetrics` gained `lines, payments, has_discount, sizes, categories, cities` (`customers.0012`) and the UI uses new params `branches, payments, discount, sizes, categories, cities`. Old names keep their old path. All list cases now < 300 ms, summary cold < 150 ms; no new index was needed. Next: browser check, docs.
- Step 6-7: tests, docs, browser check on a scratch DB (dropped). Owner approved.
- Released: merged into `production`, then `main`. Reaches the server on the next `update.sh`; the scheduler fills metrics by itself on first start. Amounts show «—» until then.

### 2026-11-02 — Call Center (`feature/call-center`, from `production`), checkpoints
- Review fix 1: «ذخیره و ساخت برنامه تماس» (list + draft program in one transaction), section/program/tab in the URL, step strip. Next: list edits; dnc; nightly timing; label; browser checks.
- Review fix 2: PATCH/DELETE `lists/<id>/`, rename and delete in the list row, «ویرایش فیلترها» on the customers page (`?edit_list=`). Fixed list used by a non-draft program refuses filter edits. Next: dnc safety.
- Review fix 3: dnc outcomes confirm before saving; managers clear dnc on Customer 360 with reason and audit fields (`calls.0004`). Cancelled tasks stay cancelled; dynamic programs pick the customer up on the next daily run, fixed lists do not. Next: nightly job timing on real data.
- Review fix 4: `attribute_purchases` on local real rows (272,209 online, 175,237 POS) with 50,000 synthetic logs in a rolled-back transaction: 1.6-1.7 s, so no narrowing needed. `attribution_sql()` split out for EXPLAIN.
- Review fix 5: UI label «کارمند فروش»; stored value stays `sales_agent`. Next: browser checks, docs, report.
- Review fixes 6-8: tests, docs, full browser run on a scratch DB (dropped). Browser run found and fixed: new program opened «پیدا نشد» before the list refreshed; edit banner moved to the top; preview refreshes after activation. Owner approved.
- Released: merged into `production`, then into `main`. The server gets it on the next `update.sh` (migrations and the scheduler's `calls_daily` come with the rebuilt image). Create agents in Settings.
- Checkpoint 1: `apps/calls` models + migrations (`calls.0001`, `0002_seed_tags`, `accounts.0003`), role `sales_agent`, `SalesAgentScopeMiddleware`. Next: lists and tasks. No API yet.
- Checkpoint 2: lists (filters/manual/excel), programs, forms (draft/publish), settings, tags, activation in background (`lists.py`, `tasks.py`, `forms.py`, `views.py`); `test_call_center.py` 8 passed. Next: saving logs. Daily dynamic-list job not yet.
- Checkpoint 3: saving logs (`logs.py`: retry/unreachable, dnc, no-call, followup, escalation, facts, 24h edit), agent list API (`agent.py`), customer calls endpoint; 18 tests passed. Next: agent UI; then builder, reports + nightly job, performance.
- Checkpoint 4: agent UI (`/calls` lazy route, `AgentPanel`, form renderer, 360 «تماس‌ها» tab + badges, sidebar/role redirect, Settings can create `sales_agent`). Manager sections are empty until the next steps. Next: form builder + programs UI.
- Checkpoint 5: form builder (autosave draft, publish, copy), programs + audience UI, settings/tags UI, «ساخت لیست تماس» on the customers page. Next: nightly job + reports.
- Checkpoint 6: nightly `calls_daily` (attribution, tag resolve, dynamic lists; hooked into `scheduler-entrypoint.sh`), reports API + UI (`reports.py`, `ReportsPanel`). Next: performance (load seed, EXPLAIN, timings), docs, screenshots.
- Checkpoint 7: `call_center_load` (dev-only, refuses a DB without "load" in its name), reports split into small GROUP BYs. All targets met on 300k logs / 1M facts / 505k tasks. Next: docs, screenshots, final report.
- Checkpoint 8 (feature complete, awaiting owner review): docs, screenshots done on a scratch DB (dropped afterwards), agent-only sidebar fixes. Not done: nothing merged; on deploy run nothing extra (migrations + scheduler pick it up). Create agents in Settings. Local dev DB has `calls` migrations applied, no call data.

### 2026-10-28 — Customers overview, prototype v3 (`feature/customers-overview`, uncommitted)

- Reference copied to `docs/design/customers-overview-v3.html` (sample numbers).
- Backend: `apps/customers/overview.py` + `GET /api/customers/overview/?period=&compare=` (`IsAuthenticated`, like
  `reports`). One SQL query: events from `semantics.py` querysets (compiled with `sql_with_params`), per-lens firsts,
  per-(window, customer) aggregation, `width_bucket` for the 12 sparkline buckets, daily first-purchase histogram;
  JIT off for that statement. Tier counts/net deltas from `Customer` + `CustomerTierHistory`. 15-minute cache.
- Deviation from the spec: no `lens`/`focus` query params. The response holds all 8 lenses (sparklines included), so
  lens and card focus switch on the client without a request; cache key = (period, compare, today).
- Frontend: `CustomerOverview.tsx`, `overviewDisplay.ts`; `CustomerListPanel` lost the old title and 4 hard-coded
  KPI cards, «خروجی اکسل» moved into the filter row, «به‌روزرسانی سطوح» + «ویرایش قوانین» into the tier panel (super
  admins only; the refresh button was visible to every role before). `?tier=CODE` filters the list. New tokens
  `--ch-shopino`, `--ch-snappay`, `--ch-digipay` (dark + light).
- Local timings (cold, 2026-10-28): 30 ≈ 2.1 s, month ≈ 2.0 s, 90/365 ≈ 2.7 s; cached ≈ instant. Target 2 s missed
  for 90/365.
- Gap: total customers 199,732 vs `purchasing_customers` 204,266 (local data; not investigated).
- Tests: `test_customer_overview.py` + `test_customers.py`, `test_operator_accounts.py`, `test_customer_tier_rules.py`,
  `test_tier_channels.py` → 74 passed; `tsc -b` OK; Vitest `src/features/customers` 31 passed.

### 2026-10-27 — Revert RFM/Club on `main`, keep internal accounts (decision 0005)
- Archived old `main` (`4a69c5d`) as `archive/rfm-club-2026-10-27` (pushed).
- Local DB (owner-approved): `migrate customers 0006_tier_rule_sets` (unapplied 0009, 0008, `0007_customer_rfm`,
  `0007_tier_channels`; `migrate customers 0007_tier_channels` planned nothing because `0007_customer_rfm` is its
  sibling). Then applied `0007_tier_channels`, `0008_internalaccount`, `0009_seed_internal_accounts`;
  `clear_operator_tiers()` cleared 14 stale tiers of the internal accounts.
- Code: `backend` and `frontend` from `origin/production`, plus internal accounts only (`InternalAccount`, exclusion by
  id in `operators.py`/`tiers.py`/list ranking, API, Customer 360 menu + confirmed banner). Removed `rfm.py`,
  `ClubPage`, `RfmReportPanel`, `rfmDisplay`, `backfill_rfm_snapshots`, RFM list filters, suspected-signals banner.
- Checks: `makemigrations --check` no changes; 15 internal accounts (6 staff, 9 desk), 0 with a tier.
- Tests: `test_internal_accounts.py`, `test_internal_accounts_seed.py`, `test_operator_accounts.py`,
  `test_customer_tier_rules.py`, `test_tier_channels.py`, `test_customers.py`, `test_customer_360.py`: 71 passed.
  Frontend: `tsc -b` OK; Vitest `src/features/customers` 26/26.

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
