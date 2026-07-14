#!/usr/bin/env bash
# Runs ON the VPS (invoked over SSH by .github/workflows/deploy.yml on every
# push to main, after CI's typecheck/lint/test gate passes) — see
# deploy/README.md for the one-time VPS setup this assumes is already done
# (deploy user, Docker, nginx, certbot, /opt/art-lessons/.env).
set -euo pipefail

APP_DIR=/opt/art-lessons
cd "$APP_DIR"

echo "==> Fetching latest main"
git fetch origin main
git reset --hard origin/main

echo "==> Installing deps and building apps/web"
npm ci
npm run build --workspace=apps/web

echo "==> Publishing static build to nginx webroot"
sudo mkdir -p /var/www/art-lessons
sudo rsync -a --delete apps/web/dist/ /var/www/art-lessons/dist/

echo "==> Building and starting the server + postgres containers"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for postgres to be healthy"
for _ in $(seq 1 30); do
  status=$(docker compose -f docker-compose.prod.yml ps --format json postgres | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
  [ "$status" = "healthy" ] && break
  sleep 2
done

echo "==> Applying Prisma migrations"
docker compose -f docker-compose.prod.yml exec -T server npx prisma migrate deploy

echo "==> Reloading nginx (picks up any config change)"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Pruning unused Docker images (keeps disk from growing every deploy)"
docker image prune -f

echo "==> Deploy complete"
