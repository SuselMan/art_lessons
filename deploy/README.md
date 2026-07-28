# Production deploy (#111, #112)

Live at **https://5ryx.l.time4vps.cloud** — a Debian 12 VPS (time4vps),
IP `80.209.232.109`. Deploys automatically on every push to `main` via
`.github/workflows/deploy.yml`.

## Architecture

- **Builds happen in CI, not on the VPS** (#199). The VPS is a 1 vCPU / 1GB
  RAM / no-swap box — running `npm ci` + the apps/web Vite build *and* a
  Docker build for apps/server, all at once, on top of the already-live
  containers, reliably OOM-killed it mid-deploy (confirmed via `dmesg`:
  `Out of memory: Killed process ... (npm ci)`). The `build` job in
  `.github/workflows/deploy.yml` now does all of that on a GitHub-hosted
  runner; the VPS only ever receives already-finished output (a pulled
  Docker image, an rsynced static bundle) — see "What happens on every push"
  below.
- **apps/web**: built as a static bundle in CI, rsynced to the VPS and
  served directly by nginx from `/var/www/art-lessons/dist` — no container,
  no Node process for the frontend.
- **apps/server**: Docker image built and pushed to GitHub Container
  Registry (`ghcr.io/<owner>/art-lessons-server`) in CI, pulled and run on
  the VPS via `docker-compose.prod.yml`. Published to `127.0.0.1:4000`
  only — nginx is the sole public entry point (see `deploy/nginx.conf`).
- **Postgres**: Docker container (`postgres:16-alpine`), named volume for
  persistence, healthchecked before the server container is allowed to
  start.
- **nginx**: reverse-proxies `/api/*` and `/socket.io/*` to the server
  container, serves everything else as the static SPA build (with an
  `index.html` fallback for client-side routing). Exact same same-origin
  shape `apps/web/vite.config.ts`'s dev proxy already uses — the built
  frontend needs no separate prod config of its own.
- **certbot**: Let's Encrypt cert for `5ryx.l.time4vps.cloud` via the nginx
  plugin (`certbot --nginx`), auto-renews via certbot's own systemd timer
  (`certbot.timer`, installed automatically with the Debian package — no
  cron job needed).
- No Redis (single server process — see CLAUDE.md), no object storage for
  binaries (Postgres bytea is enough at this scale — see #114). Both
  deferred, tracked separately (#113/#114).

## One-time VPS setup (already done, documented for reference)

- `deploy` user created, member of `docker` + passwordless `sudo`, SSH
  **key-only** login (password auth and root login both disabled in
  `/etc/ssh/sshd_config.d/99-hardening.conf`).
- `ufw` firewall: only SSH (22), HTTP (80), HTTPS (443) open.
- Docker CE + Compose plugin, nginx, certbot (+ nginx plugin), Node.js 20
  installed via apt/NodeSource.
- Repo cloned to `/opt/art-lessons` (public repo, plain HTTPS clone, no
  deploy key needed for git itself).
- `/opt/art-lessons/.env` (**not in git** — holds `POSTGRES_PASSWORD` and
  `JWT_SECRET`, generated once with `openssl rand -base64 32`,
  `docker-compose.prod.yml` reads them via `env_file`/shell interpolation).
- `deploy/nginx.conf` copied to `/etc/nginx/sites-available/art-lessons`,
  symlinked into `sites-enabled`, default site disabled.
- First cert issued once via `sudo certbot --nginx -d 5ryx.l.time4vps.cloud`
  (interactive the very first time only — picks the redirect-to-https
  option; every renewal after that is unattended via the systemd timer).
- (#199) The `art-lessons-server` GHCR package is set to **public**
  visibility (Settings → Packages on the repo, or `gh api -X PATCH
  /user/packages/container/art-lessons-server -f visibility=public` once it
  exists — a brand new package defaults to private on its first push
  regardless of the repo's own visibility) — so `docker compose pull` on the
  VPS needs no credentials. If it ever needs to go private instead, the VPS
  will need its own `docker login ghcr.io` (a PAT with `read:packages`,
  `docker login` once, credentials persist in `~deploy/.docker/config.json`)
  before `deploy.sh`'s pull step will work again.

## GitHub Actions secrets (repo settings → Secrets and variables → Actions)

- `DEPLOY_HOST` — `80.209.232.109`
- `DEPLOY_USER` — `deploy`
- `DEPLOY_SSH_KEY` — private half of the deploy keypair (public half is in
  `deploy`'s `~/.ssh/authorized_keys` on the VPS; this key is used for
  nothing else, so it can be rotated independently any time by generating a
  new pair and replacing both halves).

## What happens on every push to main

1. `.github/workflows/deploy.yml`'s `test` job: `npm ci` +
   `typecheck`/`lint`/`test` — identical gate to `ci.yml`'s PR checks.
2. `build` job (only if `test` is green, #199 — this is the part that used
   to happen ON the VPS): `npm ci` on the runner, builds `apps/web`'s static
   bundle (uploaded as a workflow artifact), builds the `apps/server`
   Docker image and pushes it to `ghcr.io/<owner>/art-lessons-server`
   tagged with the commit SHA (and `latest`).
3. `deploy` job (only if `build` succeeded): SSHes into the VPS as `deploy`
   — rsyncs the built `apps/web` bundle into `~deploy/web-dist-incoming/`,
   then brings `/opt/art-lessons` up to date (`git fetch` + `reset --hard
   origin/main` — just config files now: `docker-compose.prod.yml`, the
   deploy script itself, nginx config; no build inputs) and *only then* runs
   `deploy/deploy.sh` with `SERVER_IMAGE` set to the pushed ghcr.io tag.

   That order is deliberate: the script used to reset the checkout itself,
   which rewrote the script underneath the running bash and made any change
   to it take effect one deploy late — see the comment at the top of
   `deploy.sh`. The script:
   - rsyncs `~deploy/web-dist-incoming/` into nginx's webroot
   - `docker compose -f docker-compose.prod.yml pull` + `up -d` (pulls the
     already-built image, recreates the container only if the resolved
     image reference actually changed — SHA-tagged, so it always does when
     the code did)
   - waits for Postgres's healthcheck, then runs
     `prisma migrate deploy` inside the server container
   - `nginx -t` + reload (picks up a config change, never restarts — no
     dropped connections for existing participants)
   - prunes dangling Docker images so disk usage doesn't grow forever

## Manual redeploy / troubleshooting

```sh
ssh deploy@80.209.232.109
# deploy.sh alone only pulls+starts whatever SERVER_IMAGE already points at
# — it doesn't build anything anymore (#199), so a *manual* redeploy needs
# an image tag from an actual CI build (check the `build` job's own output,
# or just `:latest`, which the workflow always pushes alongside the SHA tag):
cd /opt/art-lessons && git fetch origin main && git reset --hard origin/main
SERVER_IMAGE=ghcr.io/suselman/art-lessons-server:latest bash deploy/deploy.sh
# Updating the checkout is a separate step on purpose: deploy.sh must not
# reset the checkout it is itself running from — see the comment at its top.
docker compose -f docker-compose.prod.yml logs -f server   # server logs
docker compose -f docker-compose.prod.yml ps               # container status
sudo systemctl status nginx
sudo certbot certificates                                   # cert expiry/status
```

## Backups (#315)

`deploy/backup.sh` runs nightly at 03:20 UTC from `/etc/cron.d/art-lessons-backup`:
dumps Postgres in custom format, verifies the archive end to end with
`pg_restore`, uploads it off the VPS with rclone, then rotates. It treats a
failed upload as a failed run — a copy that lives only on the disk it is
backing up does not survive that disk.

Retention: 14 locally in `/var/backups/art-lessons` (`KEEP_LOCAL` in
`/opt/art-lessons/.env`), 60 days off-site — the off-site half enforced by a
lifecycle rule on the bucket, not by this script.

That split is the security model, not an accident. The key on the VPS can
upload and list; it cannot read or delete. So a compromised server cannot
wipe the backups before encrypting the database — the standard opening move
against exactly this setup — and cannot download the dumps either, which hold
e-mail addresses and password hashes. Expiring old copies is therefore B2's
job, since nothing on the VPS is allowed to delete anything.

Object Lock adds the second layer: uploaded objects are immutable for 30 days
in Governance mode, so even a stolen *master* key cannot destroy the last
month of backups. 30 rather than 60 on purpose — the lock must expire before
the lifecycle rule tries to delete, or objects pile up forever.

`.github/workflows/backup-check.yml` asks the VPS once a day (07:00 UTC)
whether a fresh dump exists in both places, and fails — i.e. e-mails — when it
doesn't. The script it runs, `deploy/backup-status.sh`, is worth running by
hand whenever you're already on the box.

### Setup — nothing to do on the VPS by hand

`deploy.sh` installs rclone, creates `/var/backups/art-lessons`, and refreshes
`/etc/cron.d/art-lessons-backup` on every deploy, all idempotently. Credentials
arrive the same way: the workflow writes `/opt/art-lessons/backup.env` (mode
600) from GitHub Secrets, and rclone reads the remote's definition straight out
of the environment, so there is no `rclone.conf` to create or keep in sync.

That means a **migration to a new VPS needs no backup-specific steps at all** —
finish the box's general setup above, push, and the first deploy leaves working
backups behind. This was seven commands in the right order from a document,
which is exactly the kind of thing that gets half-done right after a move.

`backup.env` is separate from the stack's `.env` deliberately. `.env` holds
`POSTGRES_PASSWORD`, which is baked into the Postgres volume when the database
is first initialised — having CI rewrite that file on every deploy puts one
wrong character between a routine push and a server that cannot open its own
database. CI owns `backup.env`; `.env` stays hand-written and untouched.

Required in repo settings (Settings → Secrets and variables → Actions):

| | |
|---|---|
| secret `B2_KEY_ID` | application key's `keyID` |
| secret `B2_APPLICATION_KEY` | application key's secret half |
| variable `BACKUP_REMOTE` | `b2:Grafetto` — a variable, not a secret: the bucket name isn't sensitive, and renaming or moving it shouldn't need a commit |

Without them the deploy still succeeds and says so in its summary; backups then
fail loudly on their next run rather than pretending to work.

To verify after the first deploy, or any time:

```sh
ssh deploy@80.209.232.109
bash /opt/art-lessons/deploy/backup.sh        # ~a minute, writes a real dump
bash /opt/art-lessons/deploy/backup-status.sh
```

Bucket and key settings this assumes, most of them fixed at creation time:

- **Bucket**: private, region EU Central (region is fixed per account and
  cannot be migrated later), **Object Lock enabled** — it can only be turned on
  when the bucket is created. Governance mode, 30-day default retention.
- **Lifecycle rule**: delete files older than 60 days. This is what expires old
  backups; the script deliberately has no way to delete anything.
- **Application key**: scoped to this one bucket, capabilities `listFiles` +
  `writeFiles` only. The console's "Write Only" preset is the closest it
  offers; `b2 key create --bucket <bucket> vps-backup-write listFiles,writeFiles`
  sets exactly these if the preset turns out to include more.

Restores need a key that can read, which the VPS deliberately does not have —
use the console or a separate short-lived key from a trusted machine.

Losing the application key costs a new application key — GitHub Secrets can't
be read back, but they can be replaced. Leaking it costs an attacker the
ability to *add* files to the bucket, and nothing else: no reading the dumps,
no deleting them.

Cloudflare R2, Hetzner Storage Box, or any S3 endpoint work identically — only
`BACKUP_REMOTE` and the two secrets change.

### Restoring

`.dump` files are custom-format, so `pg_restore` — not `psql`. Off-site copy
first if the box itself is gone: `rclone copy b2:Grafetto/<file> .`

```sh
cd /opt/art-lessons
# Restore into a scratch database first and look at it. `-c` on the live
# database drops every object it is about to recreate, so a wrong file or a
# half-finished run leaves nothing to go back to.
docker compose -f docker-compose.prod.yml exec -T postgres \
  createdb -U art_lessons art_lessons_restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U art_lessons -d art_lessons_restore --no-owner \
  < /var/backups/art-lessons/art_lessons-<timestamp>.dump

# Sanity-check what you just restored before trusting it
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U art_lessons -d art_lessons_restore \
  -c 'SELECT count(*) FROM "User"; SELECT count(*) FROM "Room";'
```

To promote it, stop the server container first (`docker compose -f
docker-compose.prod.yml stop server`) so nothing writes mid-swap, rename the
databases, then start it again. Migrations are already inside the dump — do
not run `prisma migrate deploy` against a restored database until you have
confirmed which migration it was taken at.

**Restoring has not been rehearsed on this VPS yet** — that drill is its own
release-track item (#314 §9). Until it has been, treat the commands above as
untested-in-anger.

## Known gaps / deliberately deferred

- No rollback automation — a bad deploy needs a manual `git reset` to the
  last good commit + rerunning `deploy.sh` by hand. Fine at today's scale
  (one operator), worth revisiting if that changes.
- No staging environment — `main` is directly production. Matches this
  project's actual review process (PRs gate on CI, not on a staging deploy).
- Monitoring is GitHub-cron-based (`.github/workflows/uptime.yml`, #178):
  good enough to learn about an outage before a teacher reports it, but its
  schedule is best-effort and only runs from the default branch, so a *missing*
  run proves nothing. A free UptimeRobot-class monitor is the upgrade if prod
  ever needs detection independent of this repo.
- Backups are not encrypted at rest off-site — B2 holds them under a
  bucket-scoped key. Worth revisiting when the data is other people's students
  rather than test rooms.
