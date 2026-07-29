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

## Error reporting (#177)

Two Sentry projects, because the two halves fail differently and a shared
project would mean one alert rule for both: a browser one (`@sentry/react`,
DSN baked into the bundle at build time) and a Node one (`@sentry/node`, DSN
handed to the container on deploy). Everything below is optional — with none
of it set, both halves start with reporting disabled and nothing else changes.

**Variables** (Settings → Secrets and variables → Actions → *Variables*, not
Secrets — a DSN is a write-only ingest key: it can send events to the project
and do nothing else, and the browser one is publicly readable in the shipped
JS by necessity):

- `VITE_SENTRY_DSN` — the browser project's DSN.
- `SENTRY_SERVER_DSN` — the Node project's DSN. Passed to `deploy.sh` next to
  `SERVER_IMAGE`, read by `docker-compose.prod.yml`. Deliberately *not*
  written into the VPS's `.env`: that file holds `POSTGRES_PASSWORD`, which
  is baked into the Postgres volume at initdb time, and CI rewriting it puts
  one typo between a push and a server that cannot open its own database.
- `SENTRY_ORG`, `SENTRY_WEB_PROJECT` — org and project slugs, used only for
  the source-map upload below.

**Secret**:

- `SENTRY_AUTH_TOKEN` — an org auth token with `project:releases` (and
  `org:read`). This one *is* a credential. It uploads the browser bundle's
  source maps during the `build` job; without it the upload is skipped and
  the build still succeeds, but every production stack trace is a column
  number inside a minified chunk.

The maps are generated as `sourcemap: 'hidden'`, uploaded, then deleted
before `dist/` is rsynced to the VPS (`apps/web/vite.config.ts`) — so they
reach Sentry and nowhere else. `release` is the commit SHA on both halves;
map-to-code matching is by debug ID, so it holds regardless.

The server's own stack traces point at `src/*.ts` rather than compiled
output: `--enable-source-maps` in the Dockerfile's `CMD`, `sourceMap: true`
in `apps/server/tsconfig.json`.

**Cost in RAM, worth knowing before it surprises anyone** (§1 of #314 is
partly about not being surprised by this box's memory): initialising the Node
SDK costs ~47 MB RSS locally (42.5 MB bare node against 89.8 MB with it up),
and the production container measured 38 MB before this deploy against 97 MB
after. Without a DSN the SDK is not even imported
(`apps/server/src/instrument.ts` loads it dynamically), so dev machines and
CI pay nothing.

While measuring that, a discrepancy worth recording: **the VPS is 2 vCPU,
3.9 GB RAM and 2 GB swap** (verified 29.07 on the live box). The comments
scattered through `deploy.sh`, `deploy.yml`, `apps/server/Dockerfile` and the
sections above still describe the 1 vCPU / 1 GB / no-swap plan this started
on — the OOM-kill story behind #199 really happened, just on the smaller box.
Anything reasoning about headroom (#292's 532 MB of room history, §1 of #314's
"know the ceiling") is calibrated against a machine roughly four times
smaller than the one now running.

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
   `deploy/deploy.sh` with `SERVER_IMAGE` set to the pushed ghcr.io tag (and
   `SENTRY_DSN`/`SENTRY_RELEASE` alongside it, when configured — see above).

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
# SENTRY_DSN is passed the same way and defaults to empty — a manual
# redeploy without it produces a working server that reports nothing until
# the next CI deploy puts it back. Add it here to keep reporting on:
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

That split is the security model, not an accident. The intent is that the key
on the VPS can upload and list but neither read nor delete, so a compromised
server can neither wipe the backups before encrypting the database — the
standard opening move against exactly this setup — nor download the dumps,
which hold e-mail addresses and password hashes.

**The key in use does not match that intent** (28.07): it is Backblaze's "Read
and Write", which can read *and* delete, because their web console offers no
read-plus-write-without-delete preset — that needs `b2 key create` with an
explicit capability list. Accepted deliberately for now and tracked in #332 to
narrow before release. Read access is also what makes the restore runbook below
work from the box itself; a narrowed key means restoring from a trusted machine
instead.

Object Lock is the layer that still holds regardless: uploaded objects are
immutable for 30 days in **compliance** mode — stricter than the Governance
mode this document originally described, since compliance cannot be bypassed
even with the master key. Nothing, including the account owner, can destroy the
last month of backups. It also cuts both ways: an accidentally uploaded object
cannot be cleaned up early either. The lock must expire before the lifecycle
rule tries to delete, or objects pile up forever — hence 30 days of lock
against a rule that deletes at 31.

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
  when the bucket is created. Compliance mode, 30-day default retention
  (verified against the API on 28.07).
- **Lifecycle rule**: `daysFromUploadingToHiding: 30`, `daysFromHidingToDeleting: 1`
  — so about 31 days of history off-site, against 14 on the box. This is what
  expires old backups; the script deliberately has no way to delete anything.
  Set 28.07, when it turned out no rule existed at all and copies had been
  accumulating with nothing to expire them.

  30 rather than the 60 this document first specified (Ilya, 28.07): a month of
  daily dumps covers what off-site storage is actually for — the box or its disk
  is gone — and a fault that stays unnoticed past a month is not one a longer
  tail would have saved either, since every dump after it is equally poisoned.
  It also has to clear the 30-day Object Lock, so anything shorter would leave
  objects the rule cannot delete.

  30 rather than the 60 this document first specified (Ilya, 28.07): a month of
  daily dumps covers what off-site storage is actually for — the box or its disk
  is gone — and a fault that stays unnoticed past a month is not one a longer
  tail would have saved either, since every dump after it is equally poisoned.
  It also has to clear the 30-day Object Lock, so anything shorter would leave
  objects that the rule cannot delete.
- **Application key**: scoped to this one bucket. Intended capabilities are
  `listBuckets,listFiles,readFiles,writeFiles`, via
  `b2 key create --bucket <bucket> grafetto-backup listBuckets,listFiles,readFiles,writeFiles`
  — the console's presets cannot express that combination. In use right now is
  the console's "Read and Write", which also grants `deleteFiles` (see #332).

  Read access is not optional: without `listFiles` the daily check cannot see
  the bucket at all, and without `readFiles` a restore has nothing to download.
  The original key was "Write Only" and had neither, which is why the check had
  never once passed.

Losing the application key costs a new application key — GitHub Secrets can't
be read back, but they can be replaced. Leaking it costs an attacker the
ability to *add* files to the bucket, and nothing else: no reading the dumps,
no deleting them.

Cloudflare R2, Hetzner Storage Box, or any S3 endpoint work identically — only
`BACKUP_REMOTE` and the two secrets change.

### Restoring

Rehearsed end to end on 28.07 (#315, and the drill half of #314 §9) — the
timings and the verification below are from that run, not from theory. What
has *not* been rehearsed is the last step, promoting a restored database on
the live box; treat that one as untested-in-anger.

`.dump` files are custom-format, so `pg_restore` — not `psql`.

**Use `docker exec`, not `docker compose exec`.** Every `docker compose -f
docker-compose.prod.yml ...` command needs `SERVER_IMAGE` set or it dies with
`required variable SERVER_IMAGE is missing a value` before doing anything —
the compose file interpolates the image tag the deploy passes in. At 3am that
error reads like the stack is broken when it is only the shell that is. The
container is `art-lessons-postgres-1`.

#### 1. Get a dump, and know it is intact

```sh
cd /opt/art-lessons
set -a; . ./backup.env; set +a          # the b2: remote lives in these vars

# If the box still has its disk, the newest local dump is the fastest source:
ls -1t /var/backups/art-lessons/*.dump | head -1

# Either way, check the off-site copy matches before trusting either:
rclone check /var/backups/art-lessons/<file>.dump b2:Grafetto   # "0 differences found"

# If the box is gone, pull from off-site instead (~6 min for 293 MB):
rclone copy b2:Grafetto/<file>.dump .
```

#### 2. Restore into a scratch database first

Never straight over the live one: `pg_restore -c` drops every object it is
about to recreate, so a wrong file or a half-finished run leaves nothing to go
back to.

```sh
docker exec art-lessons-postgres-1 createdb -U art_lessons art_lessons_restore
docker exec -i art-lessons-postgres-1 pg_restore -U art_lessons \
  -d art_lessons_restore --no-owner --no-acl \
  < /var/backups/art-lessons/<file>.dump
```

293 MB restored in 40 s on a laptop; allow more on the VPS's single core.

#### 3. Verify before trusting it

Row counts first — every table, exact:

```sh
docker exec -i art-lessons-postgres-1 psql -U art_lessons -d art_lessons_restore -tAF' ' <<'SQL'
select table_name,
       (xpath('/row/cnt/text()', query_to_xml(
          format('select count(*) as cnt from %I.%I', table_schema, table_name),
          false, true, '')))[1]::text::bigint as rows
from information_schema.tables where table_schema='public' order by table_name;
SQL
```

Equal row counts are not equal data, so hash the rows themselves — run this
against both the restored database and the source, if the source still exists:

```sh
docker exec -i art-lessons-postgres-1 psql -U art_lessons -d art_lessons_restore -tA <<'SQL'
select 'Operation    ' || md5(string_agg(t::text, '|' order by t::text)) from "Operation" t
union all select 'RoomSnapshot ' || md5(string_agg(t::text, '|' order by t::text)) from "RoomSnapshot" t
union all select 'User         ' || md5(string_agg(t::text, '|' order by t::text)) from "User" t
union all select 'Room         ' || md5(string_agg(t::text, '|' order by t::text)) from "Room" t;
SQL
```

`RoomSnapshot` is the one to watch: it holds the baked binary snapshots, so it
is where a corrupted round trip would show up first.

#### 4. Promote it

```sh
SERVER_IMAGE=<tag> docker compose -f docker-compose.prod.yml stop server  # nothing writes mid-swap
docker exec art-lessons-postgres-1 psql -U art_lessons -d postgres \
  -c 'ALTER DATABASE art_lessons RENAME TO art_lessons_broken' \
  -c 'ALTER DATABASE art_lessons_restore RENAME TO art_lessons'
cd /opt/art-lessons
SERVER_IMAGE=<tag from the last green deploy> docker compose -f docker-compose.prod.yml start server
```

Keep `art_lessons_broken` until the app has been exercised — rooms open,
strokes replay, a lesson runs. Migrations are already inside the dump: do not
run `prisma migrate deploy` against a restored database until you have
confirmed which migration it was taken at.

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
