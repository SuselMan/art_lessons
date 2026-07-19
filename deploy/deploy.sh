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

echo "==> Fetching latest main (config files only — code is pre-built in CI)"
git fetch origin main
git reset --hard origin/main

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

echo "==> Pruning unused Docker images (keeps disk from growing every deploy)"
docker image prune -f

echo "==> Deploy complete"
