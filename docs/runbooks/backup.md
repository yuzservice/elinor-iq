# Backup and restore

Commands only; no secret goes into this file or into git. Values from `.env` (database password, Django secret key,
Elinor API user and password, Zernio key, cover relay token) live in the owner's password manager.

Names come from `docker-compose.yml` and `install.sh`:
- database service `postgres`; database `elinor_iq` and user `elinor` (or `$POSTGRES_DB` / `$POSTGRES_USER` inside the container);
- volumes `postgres_data` and `pulse_media` (Pulse covers);
- server path `/opt/elinor-iq`.

## Local (the Mac)

1. Push every branch, then check that nothing is ahead of `origin`:
   ```bash
   git push origin --all
   git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads
   ```
2. Make a full git bundle (every branch and tag in one file) and copy it off the Mac (external disk or cloud drive):
   ```bash
   git bundle create ~/elinor-iq-$(date +%F).bundle --all
   git bundle verify ~/elinor-iq-$(date +%F).bundle
   ```
3. Keep Time Machine on for the project folder. It covers `source/` (MariaDB dumps) and `backups/`, which git never holds.
4. Keep the `.env` values in the password manager, not in a file that leaves the Mac.

## Server: weekly database dump

Run in `/opt/elinor-iq`. The dump is a custom-format `pg_dump`, which `restore-database.sh` expects:
```bash
cd /opt/elinor-iq && mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/elinor_iq-$(date +%F).dump
ls -lh backups/elinor_iq-$(date +%F).dump
```
Pulse covers (only when Pulse is on):
```bash
docker compose exec -T pulse-scheduler python manage.py pulse_export_covers /tmp/pulse-covers.tar.gz
docker compose cp pulse-scheduler:/tmp/pulse-covers.tar.gz backups/pulse-covers-$(date +%F).tar.gz
```
Copy both files off the server from the Mac; replace `<server>` with the SSH host:
```bash
scp '<server>:/opt/elinor-iq/backups/*-'"$(date +%F)"'*' ~/elinor-backups/
```
Keep several weeks of copies. Delete old dumps on the server only after the copy is verified.

## Restore to a fresh server

1. Install the stack (asks for the domain and writes a new `.env`):
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/install.sh)"
   ```
2. Edit `/opt/elinor-iq/.env` and add the values from the password manager that `install.sh` leaves empty or out:
   - `ELINOR_API_USERNAME`, `ELINOR_API_PASSWORD`;
   - and, if Pulse is used, `PULSE_ENABLED`, `ZERNIO_API_KEY`, `ZERNIO_ACCOUNT_ID`, `PULSE_COVER_RELAY_URL`,
     `PULSE_COVER_RELAY_TOKEN`.

   Then deploy `production`:
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/production/update.sh)"
   ```
3. Copy the latest dump to the server as `/tmp/elinor_iq.dump` (from the Mac):
   ```bash
   scp ~/elinor-backups/elinor_iq-YYYY-MM-DD.dump '<server>:/tmp/elinor_iq.dump'
   ```
4. Stop the Pulse writer (the restore script stops only `backend` and `scheduler`), then restore. The script drops and
   recreates `elinor_iq` from the dump and starts the stack again:
   ```bash
   cd /opt/elinor-iq && docker compose stop pulse-scheduler
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/restore-database.sh)"
   ```
5. Apply any newer migrations and refill the summary tables:
   ```bash
   docker compose exec backend python manage.py migrate --noinput
   docker compose exec backend python manage.py refresh_customer_metrics
   docker compose exec backend python manage.py products_daily
   ```
6. Pulse covers, if backed up:
   ```bash
   docker compose cp backups/pulse-covers-YYYY-MM-DD.tar.gz pulse-scheduler:/tmp/pulse-covers.tar.gz
   docker compose exec pulse-scheduler python manage.py pulse_import_covers /tmp/pulse-covers.tar.gz
   ```
7. Check: `git log -1 --oneline` matches `origin/production`; the site opens; Settings shows the sync running.
   Log in with an existing user (users are in the database).

## What git ignores (checked 2026-11-11)
`.gitignore` covers `.env`, `source/`, `backups/*` (only `backups/.gitkeep` tracked), `*.sql`, `docker/postgres-data/`,
certbot folders, `.venv`, `node_modules`, `.agents/` and `.cursor/`. Pulse media lives in the `pulse_media` Docker volume,
not in the repo. The only env file in git is `.env.example`, with placeholders only. No dump, key or media file is tracked.
Not ignored: `*.dump` and `*.tar.gz` outside `backups/`, so keep dumps and cover archives inside `backups/`.
