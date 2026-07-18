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
   then runs `deploy/deploy.sh` with `SERVER_IMAGE` set to the pushed
   ghcr.io tag. The script:
   - `git fetch` + `reset --hard origin/main` in `/opt/art-lessons` (just
     config files now — `docker-compose.prod.yml`, this script itself,
     nginx config — no build inputs)
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
cd /opt/art-lessons && SERVER_IMAGE=ghcr.io/suselman/art-lessons-server:latest bash deploy/deploy.sh
docker compose -f docker-compose.prod.yml logs -f server   # server logs
docker compose -f docker-compose.prod.yml ps               # container status
sudo systemctl status nginx
sudo certbot certificates                                   # cert expiry/status
```

## Known gaps / deliberately deferred

- No rollback automation — a bad deploy needs a manual `git reset` to the
  last good commit + rerunning `deploy.sh` by hand. Fine at today's scale
  (one operator), worth revisiting if that changes.
- No staging environment — `main` is directly production. Matches this
  project's actual review process (PRs gate on CI, not on a staging deploy).
- Postgres backups: not yet automated (no issue filed for this yet — worth
  one before real student data accumulates).
