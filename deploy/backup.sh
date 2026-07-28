#!/usr/bin/env bash
# (#315) Nightly Postgres backup. Runs ON the VPS, from cron — see
# deploy/README.md → "Backups" for the one-time setup (directory, cron entry,
# rclone remote) this assumes.
#
# What it protects against, in order of likelihood:
#   - "I deleted the wrong thing" — any of the local dumps.
#   - A bad migration — same.
#   - The VPS's disk or the VPS itself going away — only the off-site copy.
# The third is the reason this script exists at all, so a run that dumps
# locally but fails to upload is a FAILED run, not a partial success. Losing
# the box loses the backups that lived on it.
#
# Paths keep the deployed `art-lessons` naming rather than the product's new
# name — /opt/art-lessons and /var/www/art-lessons already exist on the box,
# and renaming infra paths is its own chore, not this one's.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/art-lessons}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/art-lessons}
KEEP_LOCAL=${KEEP_LOCAL:-14}
KEEP_REMOTE_DAYS=${KEEP_REMOTE_DAYS:-60}
DB_NAME=${DB_NAME:-art_lessons}
DB_USER=${DB_USER:-art_lessons}

cd "$APP_DIR"

# Same .env the stack already reads (POSTGRES_PASSWORD, JWT_SECRET), plus the
# backup settings documented in deploy/README.md — BACKUP_REMOTE above all.
# `docker compose` picks this file up on its own for interpolation; this makes
# the same values visible to the script itself.
if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

# docker-compose.prod.yml declares `image: ${SERVER_IMAGE:?...}`, so *every*
# compose subcommand refuses to run without it — including one that only
# touches postgres. Backups must not depend on knowing which server image
# happens to be deployed, hence the placeholder: nothing here starts or
# recreates the server service.
export SERVER_IMAGE="${SERVER_IMAGE:-unused-by-backup}"
COMPOSE=(docker compose -f "$APP_DIR/docker-compose.prod.yml")

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$BACKUP_DIR/$DB_NAME-$timestamp.dump"
partial="$final.partial"

# A dump needs room, and this box has 1GB of RAM and a small disk shared with
# Docker images and Postgres itself. Filling the disk while the app is live is
# a worse outage than a missed backup, so check first rather than find out by
# taking prod down at 3am.
db_bytes=$("${COMPOSE[@]}" exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT pg_database_size('$DB_NAME')" 2>/dev/null | tr -d '[:space:]') \
  || fail "could not reach postgres to size the database — is the stack up?"
free_bytes=$(($(df --output=avail -k "$BACKUP_DIR" | tail -1) * 1024))
needed=$((db_bytes + 200 * 1024 * 1024))
log "database $((db_bytes / 1024 / 1024)) MB, free $((free_bytes / 1024 / 1024)) MB in $BACKUP_DIR"
if [ "$free_bytes" -lt "$needed" ]; then
  fail "not enough free space: need ~$((needed / 1024 / 1024)) MB, have $((free_bytes / 1024 / 1024)) MB"
fi

# -Fc (custom format) rather than plain SQL: compressed on the way out, and
# pg_restore can then list its contents, restore a single table, or restore in
# parallel — none of which a flat .sql allows.
log "dumping $DB_NAME"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$partial" \
  || { rm -f "$partial"; fail "pg_dump failed"; }

# A truncated dump is worse than no dump: it looks like a backup, ages like a
# backup, and only reveals itself on the day it's needed. `pg_restore -f` walks
# the entire archive and decompresses every data block on its way to producing
# SQL, so it hits an unexpected EOF or a corrupt block the way a real restore
# would — the output itself is thrown away. `--list` would be cheaper and
# nearly worthless here: a custom-format archive keeps its table of contents at
# the front, so listing a dump truncated halfway still succeeds.
log "verifying archive is readable end to end"
"${COMPOSE[@]}" exec -T postgres pg_restore -f /dev/null < "$partial" \
  || { rm -f "$partial"; fail "dump did not verify — refusing to keep it"; }

# Rename only after verification, so the freshness check (and any human in a
# hurry) can trust that any *.dump present is a complete, readable one.
mv "$partial" "$final"
log "wrote $final ($(du -h "$final" | cut -f1))"

# The whole point. Local copies survive a fat-fingered DELETE; only this one
# survives the disk.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  log "uploading to $BACKUP_REMOTE"
  rclone copy "$final" "$BACKUP_REMOTE" --contimeout 30s --timeout 5m --retries 3 \
    || fail "off-site upload failed — local dump kept, but it is not safe from disk loss"
  rclone delete "$BACKUP_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --rmdirs \
    || log "WARNING: remote prune failed (upload succeeded, so this run is still good)"
  log "off-site copy done"
else
  # Deliberately loud and non-zero: a backup that only exists on the machine
  # it is backing up is not a backup, and this should read as broken in cron
  # mail and in the daily check, not as a quiet 'mostly fine'.
  fail "BACKUP_REMOTE is not set — dump exists only on this disk. See deploy/README.md → Backups."
fi

# Rotation last: a failed run leaves yesterday's dumps untouched rather than
# clearing space for a backup that never arrived.
log "rotating local dumps, keeping newest $KEEP_LOCAL"
ls -1t "$BACKUP_DIR"/"$DB_NAME"-*.dump 2>/dev/null | tail -n "+$((KEEP_LOCAL + 1))" | while read -r old; do
  log "removing $old"
  rm -f "$old"
done

log "backup complete"
