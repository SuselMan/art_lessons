#!/usr/bin/env bash
# Runs ON the VPS (invoked over SSH by .github/workflows/deploy.yml on every
# push to main, after CI's typecheck/lint/test gate passes) — see
# deploy/README.md for the one-time VPS setup this assumes is already done
# (deploy user, Docker, nginx, certbot, /opt/art-lessons/.env, ghcr.io login
# if the server image package isn't public).
#
# #199: no build happens here anymore — the VPS (1 vCPU, 1GB RAM, no swap)
# was getting OOM-killed running `npm ci` + the apps/web Vite build *and* a
# Docker build for apps/server, all at once, on top of the already-live
# containers (confirmed via dmesg: `Out of memory: Killed process ... (npm
# ci)`). The workflow's own `build` job now does all of that on a real
# runner and hands this script two already-finished things: SERVER_IMAGE
# (an env var, the pushed ghcr.io tag) and ~/web-dist-incoming/ (rsynced in
# by the workflow's `deploy` job, right before this script runs).
set -euo pipefail

APP_DIR=/opt/art-lessons
cd "$APP_DIR"

# The checkout is brought up to date by whoever invokes this script, NOT here.
# It used to do its own `git fetch && git reset --hard origin/main` on the two
# lines above this comment, which quietly made every change to this file take
# effect one deploy late: bash reads a script incrementally as it runs, so
# resetting the checkout rewrites this very file underneath the running
# process, which carries on with what it had already read — the *previous*
# version.
#
# That is not theoretical. #315's backup provisioning (further down) sat on the
# box unexecuted through two successful deploys, and prod ran without any
# Postgres backup at all, while CI reported green both times. The tell was the
# deploy log jumping straight from "Syncing nginx config" to "Pruning unused
# Docker images" with the step between them missing, against a copy of this
# file on the box that plainly had it.
#
# So: update first, then run. See the workflow's "Deploy over SSH" step and
# README's manual-redeploy snippet, which both do it in that order.

echo "==> Publishing pre-built static web bundle to nginx webroot"
sudo mkdir -p /var/www/art-lessons
sudo rsync -a --delete ~/web-dist-incoming/ /var/www/art-lessons/dist/

echo "==> Pulling pre-built server image and starting containers"
export SERVER_IMAGE="${SERVER_IMAGE:?SERVER_IMAGE env var must be set by the caller}"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for postgres to be healthy"
for _ in $(seq 1 30); do
  status=$(docker compose -f docker-compose.prod.yml ps --format json postgres | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
  [ "$status" = "healthy" ] && break
  sleep 2
done

echo "==> Applying Prisma migrations"
docker compose -f docker-compose.prod.yml exec -T server npx prisma migrate deploy

echo "==> Syncing nginx config and reloading"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/art-lessons
sudo nginx -t
sudo systemctl reload nginx

# (#315) Everything the nightly backup needs, applied on every deploy rather
# than once by hand on a runbook. Deliberately *after* the app is back up:
# none of it is on the critical path for serving a lesson, and a broken
# apt mirror should not hold the deploy open.
#
# The point is migration. A rented box plus this script should end up with
# working backups; the previous version of this needed seven commands typed
# in the right order, remembered from a document, at the exact moment you are
# least inclined to read one — right after moving servers.
echo "==> Ensuring backup tooling is present"
if ! command -v rclone > /dev/null; then
  echo "    installing rclone"
  sudo apt-get update -qq
  sudo apt-get install -y -qq rclone
fi
# Owned by whoever runs the deploy (the same user cron runs the backup as),
# rather than a hardcoded `deploy`.
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 755 /var/backups/art-lessons
# `install` sets mode and ownership in one atomic step — cron silently ignores
# files in /etc/cron.d that are group- or world-writable, which is a
# spectacularly quiet way to have no backups at all.
sudo install -m 644 -o root -g root deploy/backup.cron /etc/cron.d/art-lessons-backup

echo "==> Pruning unused Docker images (keeps disk from growing every deploy)"
docker image prune -f

echo "==> Deploy complete"
