# Elinor Pulse: architecture (Phase 0)

Status: Phase 0 approved 2026-11-06 (cover option C). Phase 1 (data and sync) committed on `feature/elinor-pulse`
(`f75c398`). Phase 2 committed (`e161e14`), Phase 2.1 corrections committed (`1f671e9`). Covers through the Cloudflare relay
(§15) on the same branch, uncommitted, not merged. §12 = Phase 1 changes; §13 = Phase 2; §14 = Phase 2.1; §15 = relay.
Spec: `elinor-instagram/docs/product-spec.md` (draft 1.1) and `fit-gap-elinor-iq-2026-11-06.md` (decisions in §5.1).
Labels: **[V]** verified in code, data or a live read-only Zernio call on 2026-11-06 · **[A]** assumed, not verified.

Pulse is a daily Instagram dashboard for @elinor_boutique that links each post to its products. Phase 1 (this design)
covers data and sync only: no UI, no frontend API, no AI code, no new role.

## 1. App

| Item | Value |
|---|---|
| Path | `backend/apps/pulse` (`apps.pulse.apps.PulseConfig`, label `pulse`) |
| Installed | Always in `INSTALLED_APPS`, so its migrations run like every other app. Behaviour is gated by `PULSE_ENABLED`. |
| URLs | None in Phase 1. |
| Core tables | Read only: `products`, `variants`. No migration touches an existing table. |
| Elinor API | Never called. Pulse imports nothing from `apps.integrations.elinor`. |
| Instagram | Read only through Zernio. No publish, delete or reply calls exist in the client. |

Modules: `models.py`, `zernio.py` (HTTP client), `captions.py` (code parser), `codes.py` (title code regex, matching),
`shares.py` (weight rule), `media.py` (downloads), `sync.py` (jobs), `management/commands/pulse_*.py`.

## 2. Data source: Zernio

All of the following come from Zernio's docs and two read-only calls to `GET /v1/analytics`
for account `6aedbbd9ea60f545dbaab9e9` ([V]).

| Need | Endpoint | Notes |
|---|---|---|
| Base URL | `https://zernio.com/api` | **Not** `mcp.zernio.com` (that host is the MCP server). Network access from the server is untested ([A]); see §10. |
| Auth | `Authorization: Bearer $ZERNIO_API_KEY` | `401 missing_credentials` / `invalid_credentials`. |
| Posts with metrics | `GET /v1/analytics?accountId=…&platform=instagram&fromDate=&toDate=&page=&limit=` | Range ≤ 366 days, `fromDate` defaults to 90 days ago. Lists external (native) posts too (`isExternal: true`). |
| Pagination | `page`, `limit` (default 50) → `pagination {page, limit, total, pages}` | Page-number based. |
| One post | `GET /v1/analytics?postId=…` | Accepts the Zernio id, the external id or the Instagram media id. May answer `202` (sync pending) or `424`. |
| Daily post metrics | `GET /v1/analytics/post-timeline?postId=&fromDate=&toDate=` | One row per day per post, from Zernio's own history. Can backfill `ig_post_snapshots` (open question 3). |
| Followers per day | `followersCount` in `accounts[]` of every `/v1/analytics` response (used) | `GET /v1/analytics/instagram/follower-history` exists (≤ 89 days) but returned no values on 2026-11-06: the account was connected to Zernio that day. |
| Account reach per day | `GET /v1/analytics/instagram/account-insights?accountId=&metrics=reach&metricType=time_series` | Only `reach` has a daily series; `views` is total-only (Instagram limit). Up to 48 h delay. |
| Cover | `thumbnailUrl` on each post (also `mediaItems[].thumbnail`) | Meta CDN signed URL (`…cdninstagram.com…&oe=…`): expires. |
| Rate limits | 60 / 600 / 1,200 requests per minute by plan; analytics routes also per second: `max(6, rpm/60)`; stored post analytics share a team cap of 300 per 30 s | `429` with `Retry-After`. Post analytics are cached by Zernio for 60 min; Instagram insights lag about 24 h; followers refresh daily. |

A 3-hour sync for 30 days is 1 to 2 list requests; the daily snapshot is about 3 requests. Pulse will throttle to 1
request per second and honour `Retry-After`.

### Field mapping (CSV ⇄ Zernio) [V]

| CSV column | Zernio field | Unit / note |
|---|---|---|
| date | `publishedAt` | UTC ISO |
| type | `mediaProductType` | `FEED` / `REELS` |
| media | `mediaType` | `video` / `carousel` / `image` |
| url | `platformPostUrl` | `/p/<shortcode>/` or `/reel/<shortcode>/` |
| views | `analytics.views` | equals `impressions` for Instagram |
| reach, likes, comments, shares, saves | same names under `analytics` | counts |
| follows | `analytics.follows` | can be `null` (seen on a reel) |
| profile_views | `analytics.profileViews` | |
| er | `analytics.engagementRate` | percent (1.07 = 1.07 %) |
| avg_watch_ms | `analytics.igReelsAvgWatchTime` | ms; 0 for carousels |
| skip | `analytics.reelsSkipRate` | percent 0–100 (79.2), same scale as the CSV |
| dur | `analytics.videoDurationSeconds` | seconds; `null` when not video |
| is_ad | `isAd` (top level) | |
| caption | `content` | lines separated by `\n`; the CSV uses ` ⏎ `. Captions contain U+200F marks. |

**Post identity.** Zernio returns `_id` (its external-post id), `platforms[0].platformPostId` (Instagram media id,
e.g. `18099751124428277`) and the URL. The CSV has only the URL. Proposal: the unique key is the **shortcode** from
the URL (present in both); `ig_media_id` and `zernio_id` are stored as unique nullable columns once the first Zernio sync
sees the post. The CSV values are older than the live ones (same post: 110,057 views in the CSV, 198,018 live), so a
sync simply overwrites them.

## 3. Models and tables

All tables have the `ig_` prefix. Times are stored in UTC; "day" means the Asia/Tehran date (`TIME_ZONE`).

| Table | Columns (main) | Keys |
|---|---|---|
| `ig_accounts` | handle, zernio_account_id, is_active, followers_count, followers_updated_at | unique zernio_account_id |
| `ig_posts` | account FK, shortcode, ig_media_id, zernio_id, url, product_type (FEED/REELS), media (video/carousel/image), published_at, caption, duration_s, is_ad, is_brand_content, latest metrics (views, reach, likes, comments, shares, saves, follows, profile_views, er, avg_watch_ms, skip_rate), metrics_updated_at, source (csv/zernio), first_seen_at | unique shortcode; unique ig_media_id, zernio_id (nullable) |
| `ig_post_snapshots` | post FK, date, same metrics | unique (post, date); only days 0–29 after publish |
| `ig_account_daily` | account FK, date, followers, reach, views (nullable) | unique (account, date) |
| `ig_product_codes` | code (4 chars), product FK, title snapshot, built_at | unique (code, product); index on code |
| `ig_post_products` | post FK, position, raw_code, raw_line, caption_price | unique (post, position) |
| `ig_media_assets` | kind (post_cover / product_thumb), key, source_url, path, status (pending/ok/failed), error, attempts, fetched_at | unique (kind, key) |
| `ig_sync_runs` | job, started_at, finished_at, status, counts (JSON), error | index (job, started_at) |

- **Product FK** from `ig_product_codes`: `ForeignKey(Product, on_delete=DO_NOTHING, db_constraint=False)`. A database
  constraint would make a `products` row impossible to delete or truncate (for example by a dump re-import) while Pulse
  references it. Without the constraint, the core keeps full control and Pulse tolerates a dangling id until its next
  rebuild. `DO_NOTHING` with `db_constraint=False` creates only a column and an index on the `ig_` table.
- **Product link of a post**: `ig_post_products.raw_code` → `ig_product_codes.code` → product(s), resolved on read.
  A code with two products links to both ("چند محصول"). An unmatched code simply has no row in `ig_product_codes` yet.
- **Brand content** = a post whose parser finds no code (`is_brand_content = true`).
- **Share rule**: `shares.py` holds `PRIMARY_WEIGHT = 2`, `OTHER_WEIGHT = 1`; share = weight / sum, from `position`
  (0 = first code). Never stored; changing the rule needs no migration. 1 product 100 %; 2 → 67/33; 5 → 33 + 4 × 17.
- **Price and image** for display are read live from `variants` (`min(coalesce(final_price, price))`, Toman) and from
  `source_payload -> 'major_image' -> 'conversions' ->> 'sm'`. Only that one JSON path is read; `source_payload` is
  never copied, and `purchase_price` is never selected or stored.
- **Stock** is not read, stored or shown.
- Not created in Phase 1: AI outputs, daily tasks, chat tables.

Expected volume: under 1,000 posts and about 30,000 snapshots per year.

## 4. Caption parser

- Split lines on `\n` or ` ⏎ `; strip U+200F.
- Pattern 1: `کد\s*محصول\s*:\s*(\d{4})` (covers «کدمحصول: 8504», «کدمحصول : 5205», «کد محصول:»).
- Pattern 2: trailing 4 digits of a line whose next line contains «قیمت» (covers «نیم بگ1143»).
- Keep caption order, drop duplicates. The caption price is parsed from the «قیمت» line and stored for display only.
- A throwaway probe of these rules on `posts_100.csv` gave **88 posts with codes, 137 distinct codes, 69 multi-product
  posts, first post 2527, 2557, 1616, 7685, 8504** [V]. These are the Phase 1 test targets.
- Title code: `([0-9]{4})\s*(\||$)` on `products.title`; never `source_id`, `barcode` or `sku`.

## 5. Management commands

| Command | Job | Schedule |
|---|---|---|
| `pulse_import_csv <path>` | Import posts, metrics and caption codes from the CSV; upsert on shortcode | once, manual |
| `pulse_sync [--if-due]` | Posts published in the last 30 days (plus any new ones): upsert metrics, parse new captions, queue and download covers | due when the last success is ≥ 3 h old |
| `pulse_snapshot [--if-due]` | One snapshot per post aged 0–29 days; `ig_account_daily` for yesterday and today (followers, reach) | due once per Tehran day, after 00:30 |
| `pulse_match_products` | Rebuild `ig_product_codes` from titles (one transaction, `ig_` table only); cache `sm` thumbnails of products seen in posts (best effort, errors logged) | after every `pulse_sync` |

- `--if-due` reads the last successful run of that job in `ig_sync_runs`.
- With `PULSE_ENABLED` off every command prints one line and exits 0 without touching the database or the network.
- Every job upserts on natural keys, so running it twice gives the same rows.
- A Postgres advisory lock per job prevents overlapping runs (the pattern `apps.customers` uses for tiers).

## 6. `pulse-scheduler` service

```yaml
pulse-scheduler:
  build: { context: ., dockerfile: docker/backend.Dockerfile }
  env_file: [.env]
  environment: { POSTGRES_HOST: postgres }
  volumes:
    - ./backend:/app
    - ./docker/pulse-scheduler-entrypoint.sh:/pulse-scheduler-entrypoint.sh:ro
    - pulse_media:/pulse-media
  depends_on: { postgres: { condition: service_healthy } }
  entrypoint: ["/bin/sh", "/pulse-scheduler-entrypoint.sh"]
  restart: unless-stopped
```

The entrypoint:
- does **not** run `migrate`;
- waits until `manage.py migrate --check` passes, because the backend and the existing scheduler apply migrations;
- then loops every `PULSE_SYNC_INTERVAL_SECONDS` (default 900), running `pulse_sync --if-due && pulse_match_products`,
  then `pulse_snapshot --if-due`. Each failure is echoed and skipped, like the existing loop.

The existing `scheduler` loop is not changed. `update.sh` runs `docker compose up -d --build`, so the new service
starts on the next deploy and idles while `PULSE_ENABLED` is off.

## 7. File volume

- Named volume `pulse_media`, mounted at `PULSE_MEDIA_ROOT` (default `/pulse-media`).
- Read-write only in `pulse-scheduler`. Phase 2 mounts it read-only into whatever serves it (nginx or the backend).
- Layout: `covers/<shortcode>.jpg`, `products/<product_source_id>.jpg`.
- Files are stored as downloaded (no resizing, so no Pillow). Estimate: about 1,000 covers a year at roughly 100–200 KB,
  i.e. well under 1 GB [A].
- Downloads use `requests` with a timeout, a 5 MB cap, image content types only, and write to a temp file then rename.

## 8. Environment variables

| Variable | Default | Use |
|---|---|---|
| `PULSE_ENABLED` | `false` | Whole module |
| `PULSE_AI_ENABLED` | `false` | Reserved; nothing reads it in Phase 1 |
| `ZERNIO_API_KEY` | empty | Bearer token; server-side only |
| `ZERNIO_ACCOUNT_ID` | empty | `6aedbbd9ea60f545dbaab9e9` |
| `ZERNIO_API_BASE_URL` | `https://zernio.com/api` | Extra, so a proxy or another host needs no code change |
| `PULSE_MEDIA_ROOT` | `/pulse-media` | Volume path |
| `PULSE_SYNC_INTERVAL_SECONDS` | `900` | Loop tick; jobs still obey `--if-due` |
| `PULSE_COVER_RELAY_URL` | empty | Cloudflare Worker that fetches Instagram CDN covers (§15) |
| `PULSE_COVER_RELAY_TOKEN` | empty | Sent only as the `X-Relay-Token` header; never in a URL or a log |
| `PULSE_HANDLE` | `elinor_boutique` | Account handle (extra; no need to set it) |

Empty examples go into `.env.example`. `.env` is not read or changed by the engineer.

## 9. Dependencies

None. `requests` (already installed) covers Zernio and image downloads. The `anthropic` SDK is not added.

## 10. Risks to the core system

| Risk | Mitigation |
|---|---|
| A Pulse migration alters a core table | All models live in `apps.pulse`; the product link uses `db_constraint=False`; a test asserts that the Pulse migrations only create `ig_` tables. |
| A Pulse query writes to core tables | Pulse code writes only through `apps.pulse` models; a test runs every command and checks that row counts and `max(updated)` of `products` / `variants` are unchanged. |
| A Zernio or download stall delays the sales sync | Separate container; request timeouts; per-job advisory locks. |
| Load on the database | A few hundred rows per run; code rebuild reads about 7,600 titles once per sync. |
| Use of the Elinor API budget | No Elinor client import in Pulse (grep check in a test). |
| `purchase_price` leaks | Only `major_image.conversions.sm` is read from `source_payload`, via a single JSON path. |
| Migrations race between containers | `pulse-scheduler` never migrates; it waits for `migrate --check`. |
| Disk fills | Size cap per file; about 1,000 small files per year. |
| `PULSE_ENABLED` off | Commands exit immediately; the module is effectively absent. |

## 11. Open questions

1. **Instagram CDN is blocked from the server** [V, 2026-11-06]: `scontent.cdninstagram.com` timed out (`000`), while
   Zernio answered `401` in 0.5 s. Fresh `thumbnailUrl`s are Meta CDN links that expire about 4 days after the read
   (`oe=` on a post published 11-06 = 2026-11-10). Zernio's docs say that once a Meta link has lapsed, the analytics
   response serves `thumbnailUrl` from Zernio storage instead (written on the Facebook page; for Instagram [A]).
   Options:
   - **A. Wait for Zernio's copy**: download a cover only when `thumbnailUrl` is not on a Meta CDN host; retry each sync.
     Covers appear about 4 days late, if Zernio re-hosts Instagram covers at all.
   - **B. Outbound proxy for media only**: optional `PULSE_MEDIA_PROXY` (an HTTPS proxy outside Iran that the owner
     controls), passed to `requests` for cover downloads only; Zernio calls stay direct.
   - **C. Both**: B when configured, otherwise A. Until a cover exists, Phase 2 shows the first product's `sm` image or
     a placeholder.
   Proposal: C. Needs one more server check (below) to see whether Zernio storage is reachable.
2. **Product images** [V, 2026-11-06]: `api.elinorboutique.com` answered `404` at the root from the server in 2.4 s, so
   the host is reachable from the server (it timed out from the dev Mac). Caching `sm` thumbnails stays best effort.
3. **Snapshots**: Zernio already keeps a per-post daily timeline (`post-timeline`). Option A (spec): our own daily
   snapshot from 00:30 onwards. Option B: also backfill the first 30 days of each post from `post-timeline`, so the
   growth chart works from day one, including the 100 imported posts. Proposal: B, still capped at 30 days.
4. **Account daily views**: Instagram serves account `views` only as a total, not per day. Proposal: store followers and
   reach per day, leave `views` null (or fill it from `GET /v1/analytics/daily-metrics?attribution=received`; to decide
   in Phase 2 with the KPI cards).
5. **Zernio plan**: which rate tier (60 / 600 / 1,200 per minute) and whether the analytics add-on stays active
   (`hasAnalyticsAccess` is `true` today [V]). The design needs under 10 requests per run either way.
6. **Unique key**: shortcode from the URL, with media id and Zernio id stored too. OK?
7. **Snapshot window**: the spec says "after 00:30 Tehran". Instagram insights lag about 24 h, so a 00:30 snapshot
   records yesterday's numbers as of Zernio's last refresh. Acceptable for the growth chart?

### Server checks (owner runs on the server; no key needed)

```bash
curl -sS -o /dev/null -w "zernio %{http_code} %{time_total}s\n" https://zernio.com/api/v1/analytics
curl -sS -o /dev/null -m 15 -w "ig-cdn %{http_code} %{time_total}s\n" https://scontent.cdninstagram.com/
curl -sS -o /dev/null -m 15 -w "elinor-img %{http_code} %{time_total}s\n" https://api.elinorboutique.com/
```

Expected if reachable: Zernio `401` (no key sent). The other two: any HTTP code means the host is reachable; `000` means
blocked or timed out.

Results from the server, 2026-11-06: Zernio `401` 0.53 s · Instagram CDN `000` (timeout) · Elinor images `404` 2.4 s.
The dev Mac showed the opposite for the last two (CDN `204`, Elinor images timeout), so local runs cannot stand in for
the server on network questions.

Follow-up check (Zernio storage host, where re-hosted media is served [A]):

```bash
curl -sS -o /dev/null -m 15 -w "zernio-media %{http_code} %{time_total}s\n" https://media.zernio.com/
```

Result from the server, 2026-11-06: `404` in 0.58 s, so `media.zernio.com` is reachable. Whether Zernio actually re-hosts
Instagram covers there after the Meta link expires is still [A]; the first post imported on 11-06 will show it after
2026-11-10.

## 12. Phase 1 decisions and changes (2026-11-06)

- **Covers: option C.** Without `PULSE_MEDIA_PROXY` a cover on a Meta CDN host waits (`covers_waiting`) until Zernio
  serves it from its own storage; with the proxy it is fetched at once, through the proxy only. A failing source URL is
  retried at most 5 times; 3 consecutive failures stop the batch, so an unreachable host costs 3 timeouts per run.
- **Open questions 3–7, defaults taken:** shortcode is the unique key; account daily `views` stays empty; no
  backfill from `post-timeline` yet; the snapshot run after 00:30 stores the latest synced numbers under **yesterday's**
  Tehran date (the day that just ended).
- **Title code regex differs from the prompt.** The prompt's `([0-9]{4})\s*(\||$)` also matches the last 4 digits of
  longer numbers: 19 titles end in 5–8 digits (e.g. `10598`, `06080103`) and would get fake codes (`0598`, `0103`).
  Pulse uses `(?<![0-9])([0-9]{4})\s*(?:\||$)`: 7,330 products get a code instead of 7,349. The 137 caption codes are
  unaffected (132 matched either way). [V, local DB]
- **Followers** come from `followersCount` in the analytics list response, stored on `ig_accounts` at each sync and
  copied to `ig_account_daily` by the snapshot. Follower history was empty on the day of connection.
- **`pulse_match_products --if-due`** runs only when a newer `pulse_sync` succeeded, so the 15-minute loop does not
  rebuild 7,330 codes every tick.
- **Caption storage:** CSV captions are stored with `\n` line breaks (` ⏎ ` replaced), like Zernio's.
- **Product name of a labelled code** («کدمحصول: 8504») is the line before it; `raw_line` stores that name line.
- **CSV import never overwrites a post that Zernio already updated** (`source = zernio`).
- **CSV fixture** copied into the repo for tests: `backend/tests/fixtures/pulse/posts_100.csv` (public post data only).

## 13. Phase 2: read-only API, UI, `content` role, rule-based texts (2026-11-06)

**Access.** `PULSE_ROLES` (`apps/pulse/permissions.py`) = super_admin, admin, content. `PulseAccess` answers 404 while
`PULSE_ENABLED` is off and 403 for other roles. New role `content` (`accounts.0004`, choices only; `sqlmigrate` = no-op):
`SalesAgentScopeMiddleware` limits it to `/api/auth/`, `/api/health/`, `/api/pulse/`. `GET /api/auth/me/` adds
`features.pulse`. Frontend: nav item «پالس» only with `features.pulse`; content users see only «پالس» and land on `/pulse`;
settings and the sidebar sales widget are hidden for them.

**API (`/api/pulse/`).** `status/`, `home/`, `tasks/<id>/toggle/` (POST, the only write), `posts/` (kind all / reel /
slide / brand, `from`, `to`, `hour`, `code`, sort new / score / saves / shares, 30 per page), `posts/<id>/`, `products/`,
`products/<code>/`, `hours/?group=reel|all`, `media/<id>/` (authenticated file from `PULSE_MEDIA_ROOT`, path checked to
stay inside it, `Cache-Control: private, max-age=86400`). Responses list fields explicitly; `source_payload` and
`purchase_price` never leave the server (tested).

**Definitions** (`rules.py` holds every threshold):
- Groups: reel = `video` + `REELS`; everything else (carousel, image, FEED video) is the slide group.
- Fresh = under 48 h; excluded from medians. Median = views of non-fresh posts of the group in the last 30 days, or
  90 days when the group has fewer than 5. Score = views / median, 2 decimals; bands ≥ 1.5, ≥ 1.0, ≥ 0.7, below.
- KPI cards: the 7 Tehran days ending yesterday vs the 7 before, by publication day; 14 daily points each.
- Golden hours: non-fresh posts of the last 90 days, weekday (Saturday first) × Tehran hour, median score, faded under
  3 posts; noon 11:00–14:59, night 18:00–23:59.
- Products: weighted views and saves with `shares.py`; price = min(coalesce(final_price, price)) of non-deleted variants.

**Jobs added to `pulse-scheduler`.** `pulse_backfill_snapshots --if-due` (daily) and `pulse_daily_brief --if-due`
(after 08:00 Tehran; `--force` rebuilds and resets ticks). New tables `ig_daily_briefs` (one per day) and
`ig_daily_tasks` (date × position, done, done_by, done_at); `ig_post_snapshots.source` (daily / timeline) and
`ig_posts.timeline_backfilled_at` (`pulse.0002`).

**Texts.** `texts.py` holds every Persian sentence (brief, tasks, autopsy). `fa()` converts digits and removes em dashes;
tested on generated output. Autopsy is computed on read.

**Findings on real data (2026-11-06), reported instead of silently changed:**
- **Backfill cannot give history.** Zernio's post-timeline starts on 2026-11-06, the day the account was connected; a
  post from 10-06 has one row (11-06). First run: 79 requests in 84 s, 72 rows created, 21 CSV-only posts skipped (no
  Zernio id). Growth charts fill day by day from now on.
- **Brief sentence 1 is unfair by design.** Yesterday's posts are under 48 h old but are compared with full-life daily
  totals: «دیروز ۲ پست ... ۷۱٫۶ هزار بازدید ... ۶۲٪ کمتر از یک روز معمولی». It will almost always read as a drop.
  Proposal: compare with older posts at the same age (from snapshots, once they exist) or drop the percentage.
- **"Weakest non-fresh post of yesterday" never exists.** At 08:00 every post from yesterday is under 32 h old, so the
  sentence is always skipped. Proposal: weakest non-fresh post of the last 3 days.
- **Star of yesterday** is usually a fresh post with a low score (0.6× today). Shown with «در حال جمع شدن».
- Today's tasks fired: first_second (skip 79 %), night_posting (12 of 16 reels at night; noon 73.1 k vs night 60.3 k),
  neglected_product (29 days). The slide median uses the 90-day fallback (fewer than 5 slides in 30 days).
- In the in-app preview browser the CSS animation clock stood still (`document.timeline.currentTime` = 0), so fade-ins
  stayed at opacity 0 there; screenshots were taken with animations disabled from the console. Not seen as a code
  issue; worth a glance on a real phone.

## 14. Phase 2.1: corrections (2026-11-06)

Decisions: `elinor-instagram/docs/review-phase2-2026-11-06.md` §4, §6 and §7.

**Fresh posts in generated text.** Yesterday's posts are 8 to 32 hours old at 08:00, so no generated sentence (brief,
task, autopsy) gives a score or «N برابر» for a post under 48 h (tested).
- Day sentence: yesterday's total vs the median of earlier days at the same age (`same_age_median`). A day counts only
  when every post of that day has its publish-day snapshot; at least `SAME_AGE_MIN_DAYS` (5) days, otherwise the raw
  total only. The publish-day snapshot is taken around 00:30, while yesterday's total is read at 08:00: about 8 more
  hours of views, so the comparison slightly favours yesterday. Accepted.
- Star: the most viewed post of yesterday, raw views and «ارسال», «عددها هنوز بالا می‌روند»; no score (brief and home card).
- Weakest post: lowest score among non-fresh posts of the last `WEAK_DAYS` (3) days, only below 1.0.
- Rule 2 (repeat_winner): best non-fresh post of the last `WINNER_DAYS` (3) days with score ≥ 1.5, not named by this rule
  on either of the previous 2 days. `ig_daily_tasks.post` (nullable, `pulse.0003`) stores the post.
- Wording: «ارسال» for shares everywhere (texts and UI). `texts.post_name` strips emojis, prices, labelled and trailing
  product codes.
- Growth chart: shown only when snapshots start in the post's first two days; otherwise «نمودار رشد از {date} ثبت
  می‌شود», with the post's first snapshot date (or the first snapshot date of the account).

**Full window.** `pulse_sync --full` reads 90 days once (idempotent, upsert on shortcode); the regular sync stays at 30.
Real run 2026-11-06: 101 posts in 3 requests; 21 CSV-only posts became Zernio posts (ids, live metrics, cover URLs);
1 post created: `DfaQS0sGz4j`, a reel published 2026-11-06 22:00 Tehran, after the CSV export and the previous sync.
All 101 posts are now `source = zernio` (2026-09-29 to 2026-11-06).

**Covers (superseded by §15: the command below was removed).** `pulse_refresh_covers --if-due` (daily, in `pulse-scheduler`): for covers still waiting or failed whose
post is outside the 30-day window, one single-post read (`GET /v1/analytics?postId=`, verified response shape:
`postId`, `platformAnalytics`, `thumbnailUrl`) refreshes the URL; at most `COVER_REFRESH_CAP` (30) reads per run,
1 request per second. A Meta link whose `oe` expiry is still in the future is skipped, because Zernio re-hosts only
after it lapses. The first time a non-Meta cover host appears it is logged (warning). `GET /api/pulse/status` now
returns `covers {ok, waiting, failed, last_error, last_error_host}`. No proxy. Real state 2026-11-06: 101 covers
waiting, 0 ok, 0 failed; the Meta links expire around 2026-11-11 00:00 to 03:00 Tehran. Whether Zernio's storage
host is reachable from the Iran server is not known yet [A]: watch `covers.failed` and `last_error_host` after 11-11.

## 15. Covers through the Cloudflare relay (owner's decision, 2026-11-06)

Covers come only from Instagram's own CDN, fetched through a Cloudflare Worker relay
(`https://elinor-cover.yuzservicegroup.workers.dev`; code `elinor-instagram/docs/cover-relay/worker.js`), as soon as a
post is seen. A Zernio-hosted (or any non-Meta) cover URL is never downloaded. Replaces option C: `PULSE_MEDIA_PROXY`
and `pulse_refresh_covers` (which only fetched Zernio's re-hosted URLs) are removed. `IgMediaAsset.url_checked_at`
(`pulse.0003`) stays in the table, unused.

**Relay contract.** `GET {PULSE_COVER_RELAY_URL}/?url=<encoded Meta CDN URL>` with header `X-Relay-Token`; 200 image,
403 bad token, 400 host not allowed, 502 upstream. Only `*.cdninstagram.com` / `*.fbcdn.net`, https, at most 5 MB.
Worker note (not changed): it follows redirects without re-checking the final host; low risk on Cloudflare.

**Behaviour (`media.py`).**
- A cover asset keeps the newest Meta URL. A non-Meta URL never replaces it; with no Meta URL known the asset is
  `skipped` («non-Meta cover URL ignored (host)»). Each non-Meta host is logged once per run.
- `pulse_sync` downloads new Meta covers in the same run (at most 2 per second, 3 consecutive failures stop the batch).
- A failed download is retried on later runs while the link's `oe` (hex Unix time) is in the future. After expiry
  without a file the asset becomes `expired` and the post keeps the fallback (first product's `sm`, else the gradient).
- Relay not configured: covers stay `pending`, no error.
- `pulse_fetch_covers`: download every pending cover now.
- Files are kept as delivered (no resizing). Real average about 630 KB (2086×3702 JPEG ≈ 427 KB). A resized copy is not
  added; if the grid feels slow on phones, a later option is a 600 px copy (≈ 60 to 80 KB each) [A], which needs Pillow
  (a new dependency) or resizing on the relay.
- `GET /api/pulse/status` → `covers {ok, pending, failed, expired, skipped, relay_configured, last_relay_error}`.

**Moving covers to the server** (the server database is separate; the server can reach the relay, answered 403 without
a token, ✅ 2026-11-06):
1. Local: `docker compose exec -e PULSE_MEDIA_ROOT=<local media root> backend python manage.py pulse_export_covers /backups/pulse-covers.tar.gz`
   (writes `<shortcode>.jpg` files into one tarball; under `./backups/` on the host).
2. Copy the tarball to the server's `./backups/` folder (for example with `scp`).
3. Server, after Pulse is deployed, `PULSE_ENABLED=true`, and one `pulse_sync --full` has created the posts:
   `docker compose run --rm -v ./backups:/backups pulse-scheduler python manage.py pulse_import_covers /backups/pulse-covers.tar.gz`
   (the command must run where `PULSE_MEDIA_ROOT` is the `pulse_media` volume, i.e. in `pulse-scheduler`).
4. Import attaches each file by shortcode and marks it ok; unknown shortcodes are skipped; an existing ok file is never
   overwritten; running it again changes nothing.

