# Production deploy (#111, #112)

Live at **https://5ryx.l.time4vps.cloud** — a Debian 12 VPS (time4vps),
IP `80.209.232.109`. Deploys automatically on every push to `main` via
`.github/workflows/deploy.yml`.

## Architecture

- **apps/web**: built as a static bundle (`npm run build --workspace=apps/web`)
  and served directly by nginx from `/var/www/art-lessons/dist` — no
  container, no Node process for the frontend.
- **apps/server**: Docker container (`apps/server/Dockerfile`), built and run
  via `docker-compose.prod.yml`. Published to `127.0.0.1:4000` only — nginx
  is the sole public entry point (see `deploy/nginx.conf`).
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

## GitHub Actions secrets (repo settings → Secrets and variables → Actions)

- `DEPLOY_HOST` — `80.209.232.109`
- `DEPLOY_USER` — `deploy`
- `DEPLOY_SSH_KEY` — private half of the deploy keypair (public half is in
  `deploy`'s `~/.ssh/authorized_keys` on the VPS; this key is used for
  nothing else, so it can be rotated independently any time by generating a
  new pair and replacing both halves).

## What happens on every push to main

1. `.github/workflows/deploy.yml`'s `test` job: `npm ci` +
   `typecheck`/`lint`/`test` — identical gate to `ci.yml`'s PR checks. The
   `deploy` job only runs if this is green.
2. GitHub Actions SSHes into the VPS as `deploy` and runs
   `deploy/deploy.sh`, which:
   - `git fetch` + `reset --hard origin/main` in `/opt/art-lessons`
   - `npm ci` + builds `apps/web`, publishes the build to nginx's webroot
   - `docker compose -f docker-compose.prod.yml up -d --build` (rebuilds
     the server image, recreates the container only if it changed)
   - waits for Postgres's healthcheck, then runs
     `prisma migrate deploy` inside the server container
   - `nginx -t` + reload (picks up a config change, never restarts — no
     dropped connections for existing participants)
   - prunes dangling Docker images so disk usage doesn't grow forever

## Manual redeploy / troubleshooting

```sh
ssh deploy@80.209.232.109
cd /opt/art-lessons && bash deploy/deploy.sh   # same thing CI runs
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
