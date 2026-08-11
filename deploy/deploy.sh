#!/usr/bin/env bash
# Runs ON the VPS (invoked over SSH by .github/workflows/deploy.yml on every
# push to main, after CI's typecheck/lint/test gate passes) — see
# deploy/README.md for the one-time VPS setup this assumes is already done
# (deploy user, Docker, nginx, certbot, /opt/art-lessons/.env, ghcr.io login
# if the server image package isn't public).
#
# #199: no build happens here anymore — the VPS was getting OOM-killed running
# `npm ci` + the apps/web Vite build *and* a Docker build for apps/server, all
# at once, on top of the already-live containers (confirmed via dmesg: `Out of
# memory: Killed process ... (npm ci)`). The box at the time was 1 vCPU / 1 GB
# / no swap; on 2026-08-10 it is 2 vCPU / 3.9 GB / 2 GB swap (#415), so the
# original reason no longer binds — but the build stays in CI regardless,
# because a deploy has no business holding the sources. The workflow's own
# `build` job now does all of that on a real
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

# (#425) Kernel TCP settings before anything else — cheap, idempotent, and the
# reason it lives here rather than in README's one-time-setup list is that a
# hand-applied sysctl is invisible: it survives until the box is rebuilt and
# then vanishes with no failing check anywhere. Syncing it on every deploy is
# what makes "prod runs BBR" a fact of this repo instead of a fact about one
# machine's filesystem. See deploy/sysctl-bbr.conf for the measurements.
#
# Absolute /sbin paths throughout: the deploy user's PATH is
# /usr/local/bin:/usr/bin:/bin:/usr/games, so tc/sysctl/modprobe are not on it
# (`ip` is, at /usr/bin/ip — hence the inconsistency below). Under `sudo` they
# would resolve via secure_path, but the read-only checks here don't use sudo.
#
# Non-fatal on purpose, against `set -e` at the top of this file: a kernel
# without tcp_bbr is a slow prod, not a broken one, and it must not be the
# thing that blocks shipping a fix.
echo "==> Syncing kernel TCP settings (BBR + fq)"
if sudo /sbin/modprobe tcp_bbr 2>/dev/null; then
  # The module ships with the kernel but is not autoloaded — until it is,
  # `bbr` is absent from tcp_available_congestion_control and the sysctl
  # below is rejected.
  echo tcp_bbr | sudo tee /etc/modules-load.d/bbr.conf >/dev/null
  sudo cp deploy/sysctl-bbr.conf /etc/sysctl.d/99-bbr.conf
  sudo /sbin/sysctl --system >/dev/null
  # `default_qdisc` only governs qdiscs created after it is set, so an
  # already-up interface has to be converted explicitly. Derived from the
  # default route rather than hardcoded to ens3, so a rebuilt box with
  # different interface naming still gets it. `replace` is idempotent; the
  # guard only keeps the deploy log honest about whether anything changed.
  BBR_IFACE="$(ip route show default | awk '{print $5; exit}')"
  if [ -n "$BBR_IFACE" ] && ! /sbin/tc qdisc show dev "$BBR_IFACE" | head -1 | grep -q '^qdisc fq '; then
    sudo /sbin/tc qdisc replace dev "$BBR_IFACE" root fq
    echo "    $BBR_IFACE qdisc -> fq"
  fi
  echo "    congestion control: $(/sbin/sysctl -n net.ipv4.tcp_congestion_control)"
else
  echo "    WARNING: tcp_bbr unavailable on this kernel, leaving congestion" \
       "control at $(/sbin/sysctl -n net.ipv4.tcp_congestion_control)"
fi

# (#322) nginx first, webroot second — the reverse of the obvious order, and
# load-bearing since the paper bake became content-hashed.
#
# The webroot lands ~30-120s before this point if the config sync stays where
# it used to be (below, after the image pull, the postgres health wait and the
# migrations). In that window `/paper/manifest.json` exists on disk but is
# still being served by the *previous* config, whose `/paper/` block gave
# everything `max-age=86400`. Any client opening a room in that window pins the
# manifest for a day with no revalidation — and the next deploy that changes
# the bake deletes the files that manifest names, so those clients get a 404,
# no paper, and a canvas that refuses to draw until the cache expires. Exactly
# the failure the `no-cache` on the manifest exists to prevent, arriving
# through deploy ordering instead of through the config.
#
# Reloading first is safe in the other direction: the new config applied to the
# old bundle only means the old fixed-name assets are served immutably for the
# minute before they are replaced, and no bundle after this deploy ever asks
# for those URLs again.
echo "==> Syncing nginx config and reloading"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/art-lessons
sudo nginx -t
sudo systemctl reload nginx

echo "==> Publishing pre-built static web bundle to nginx webroot"
sudo mkdir -p /var/www/art-lessons
# (#322) --delete-after --delay-updates, not a bare --delete, because the paper
# manifest and the files it names must never be visible in disagreement.
#
# `--delete` defaults to --delete-during: rsync removes vanished files as it
# walks each directory, so the previous bake's `coarse.<oldhash>.paper` is gone
# while the old manifest.json — same name, so never "vanished" — is still being
# served and still naming it. And within a directory rsync works in sorted
# order, so `manifest.json` is written before `medium.*` ('ma' < 'me'): the new
# manifest names files that do not exist yet. Either window is a 404 on a
# 4 MB asset, which the client cannot distinguish from "this room has no
# paper". Before hashing, every name was fixed and rsync replaced each file
# atomically, so a client always got *a* valid texture — old or new, never
# nothing.
#
# --delay-updates stages the whole update and renames it into place at the end;
# --delete-after holds the removals until after that. The two together shrink
# the disagreement window to the final rename pass instead of the length of a
# ~12 MB copy on a 1-vCPU box.
sudo rsync -a --delete-after --delay-updates ~/web-dist-incoming/ /var/www/art-lessons/dist/

echo "==> Pulling pre-built server image and starting containers"
export SERVER_IMAGE="${SERVER_IMAGE:?SERVER_IMAGE env var must be set by the caller}"
# (#177) Optional, unlike SERVER_IMAGE: passed by the workflow the same way,
# read by docker-compose.prod.yml's ${SENTRY_DSN:-}. Exported explicitly so a
# manual redeploy that sets them on the command line behaves identically to a
# CI one. Absent means the server runs without error reporting, which is a
# working server, not a broken deploy.
export SENTRY_DSN="${SENTRY_DSN:-}"
export SENTRY_RELEASE="${SENTRY_RELEASE:-}"
# (#316) Same mechanism, different stakes: absent means nobody can sign in,
# because signing in is a code mailed to the address. The deploy still goes
# through — a box that can't send mail is better than no deploy, and the
# server says so loudly at boot (see index.ts) — but this is the one of these
# whose absence is an outage rather than a missing feature.
export RESEND_API_KEY="${RESEND_API_KEY:-}"
export EMAIL_FROM="${EMAIL_FROM:-}"
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

# (#275) Уборка старых образов сервера. Здесь раньше стоял `docker image prune
# -f` с комментарием «keeps disk from growing every deploy», и он не делал
# ничего: без `-a` эта команда убирает только «висячие» образы — те, что
# потеряли тег. Каждый наш образ помечен хешем коммита и тег сохраняет
# навсегда, поэтому под неё не попадал ни один. Обнаружено 10.08 замером
# диска: 108 образов сервера при одном используемом.
#
# Взять `prune -a` вместо этого нельзя: он снёс бы и предыдущий образ, то есть
# ровно то, чем откатываются, когда свежая выкатка оказалась плохой. Поэтому
# считаем по-другому — оставить N последних по дате, остальные удалить.
#
# Три, а не один: текущий, предыдущий (откат в одно действие) и ещё один на
# случай, если плох окажется и предыдущий. Дальше в глубину откат всё равно
# идёт через `docker pull` из ghcr.io, где образы остаются независимо от того,
# что лежит на коробке.
#
# Ни одна ошибка здесь не должна валить деплой: приложение к этому моменту уже
# поднято и работает, а неубранный образ — это занятое место, а не авария.
# Удалить образ, на котором работает контейнер, docker откажется сам — это
# страховка помимо счётчика.
KEEP_SERVER_IMAGES="${KEEP_SERVER_IMAGES:-3}"
echo "==> Pruning old server images (keeping the newest $KEEP_SERVER_IMAGES)"
# CreatedAt идёт первым полем, чтобы сортировка по строке была сортировкой по
# дате; `awk '!seen'` схлопывает случай, когда на один образ смотрят два тега.
stale=$(docker images "${SERVER_IMAGE%%:*}" --format '{{.CreatedAt}}\t{{.ID}}' \
  | sort -r | cut -f2 | awk '!seen[$0]++' | tail -n +$((KEEP_SERVER_IMAGES + 1)) || true)
if [ -n "$stale" ]; then
  echo "$stale" | while read -r image_id; do
    docker rmi "$image_id" > /dev/null 2>&1 || echo "    still referenced, kept: $image_id"
  done
fi
# И висячие слои следом — то, ради чего исходная команда и звалась. Теперь ей
# есть что убирать: удаление образов выше как раз их и производит.
docker image prune -f > /dev/null
# Печатается состояние, а не «сколько освободили». Дельта тут была и врала:
# первый настоящий прогон 10.08 снёс 105 образов и напечатал «freed: 0 MB»
# рядом с выросшим на 12 ГБ свободным местом. Docker отдаёт место
# асинхронно — `docker rmi` возвращается, когда снята ссылка, а слои чистит
# драйвер хранилища следом, — поэтому разность, снятая по обе стороны от
# удаления, измеряет не результат, а то, успел ли он произойти. Состояние же
# верно всегда, когда бы его ни снять.
echo "    server images now: $(docker images "${SERVER_IMAGE%%:*}" -q | sort -u | wc -l), disk free: $(df -h --output=avail / | tail -1 | tr -d ' ')"

echo "==> Deploy complete"
