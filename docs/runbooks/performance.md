# Performance: slow endpoints, Postgres settings, nightly jobs

Server: 4 vCPU / 8 GB RAM / 4 GB swap (since 2026-11). It runs the same jobs about 10× slower than the development Mac,
so local timings below are multiplied accordingly when judging the server.

## Find the slowest endpoints (run on the server after a day of use)
Every API request at or above `SLOW_REQUEST_MS` (default 300 ms) is logged by `apps/core/timing.py` as
`SLOW_API <method> <path> <status> <ms>`: no query strings, payloads or users. The 20 slowest endpoints by average:
```bash
cd /opt/elinor-iq && docker compose logs --since 24h backend | grep -o 'SLOW_API .*' | awk '{k=$2" "$3; n[k]++; s[k]+=$5; if($5>m[k])m[k]=$5} END{for(k in n) printf "%7d ms avg %7d ms max %6d x  %s\n", s[k]/n[k], m[k], n[k], k}' | sort -rn | head -20
```
Slow SQL statements (Postgres logs every statement over 500 ms):
```bash
cd /opt/elinor-iq && docker compose logs --since 24h postgres | grep -o 'duration: [0-9.]* ms.*' | sort -k2 -rn | cut -c1-300 | head -20
```

## Postgres settings (`docker-compose.yml`, overridable in `.env`)
| Setting | Value | Why |
|---|---|---|
| `shared_buffers` | 2GB | Postgres's own page cache: a quarter of RAM is the usual starting point. |
| `effective_cache_size` | 5GB | Tells the planner how much the OS will cache; not allocated. Makes index plans look as cheap as they are. |
| `work_mem` | 16MB | Memory per sort or hash step before spilling to disk; the report queries sort and hash a lot. Per step, so kept modest. |
| `maintenance_work_mem` | 512MB | Faster index builds and VACUUM (migrations, nightly rebuilds). |
| `random_page_cost` | 1.1 | SSD: random reads cost about the same as sequential ones, so the planner uses indexes (for example the GIN index on customer products). |
| `effective_io_concurrency` | 200 | SSD can serve many reads at once (bitmap scans). |
| `max_parallel_workers_per_gather` | 2 | Half the vCPUs for one query, leaving room for the web workers. |
| `log_min_duration_statement` | 500ms | Logs slow statements (see above). |
| `shm_size` (container) | 1g | Shared memory for parallel queries; the Docker default (64 MB) is too small. |

Nothing is destructive: the settings apply when the `postgres` container restarts (`update.sh` does this). To go back, set
the values in `.env` (for example `PG_SHARED_BUFFERS=128MB`) and run `update.sh` again.

## Nightly jobs (scheduler, Tehran time)
Heavy daily jobs run once between `NIGHTLY_FROM_HOUR` and `NIGHTLY_TO_HOUR` (default 02:00–05:00): customer tiers and
metrics, Call Center daily, products daily, sales daily summary. Each skips itself when it already ran that day. The hourly
Elinor sync is unchanged. A first fill of customer metrics still runs at any hour when the table is empty.

## Scheduler changes no longer need an image rebuild
`docker/scheduler-entrypoint.sh` is bind-mounted into the `scheduler` container (like `backend-entrypoint.sh`), so a change
takes effect after `update.sh` restarts the container. Once this release is on the server, remove the temporary crontab line
that ran `products_daily` (the scheduler now runs it in the nightly window):
```bash
sudo crontab -l | grep -n products_daily
sudo crontab -l | grep -v products_daily | sudo crontab -
sudo crontab -l
```
Then check that the scheduler runs the nightly jobs (after 02:00 Tehran):
```bash
cd /opt/elinor-iq && docker compose logs --since 12h scheduler | grep -E 'Nightly jobs|products_daily|sales_daily_summary'
```

## Optional package mirrors for image builds (for Pillow / Pulse)
When the server cannot reach Debian or PyPI, the image build fails and `update.sh` keeps the old image (so new packages such
as Pillow never arrive). Three optional `.env` values are passed to the build; empty means the default sources:
- `APT_MIRROR`: a Debian mirror base URL that replaces `http://deb.debian.org/debian`, for example `https://<mirror>/debian`.
- `PIP_INDEX_URL`: a PyPI simple index, for example `https://<mirror>/simple`.
- `PIP_TRUSTED_HOST`: only for a mirror without valid HTTPS (its host name).

Test a mirror on the server first; each command must print `200`:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' "https://<mirror>/debian/dists/bookworm/Release"
curl -sS -o /dev/null -w '%{http_code}\n' "https://<mirror>/simple/pillow/"
```
Then add the values to `/opt/elinor-iq/.env` and run `update.sh`. The build has a 30-minute limit; on failure the services
start again with the existing images. Check that Pillow is in the image afterwards:
```bash
cd /opt/elinor-iq && docker compose exec -T backend python -c "import PIL; print(PIL.__version__)"
```
To go back to the default sources, empty or remove the three values and run `update.sh` again.
