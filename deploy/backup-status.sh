#!/usr/bin/env bash
# (#315) Answers one question: is there a backup from the last day, both on
# this disk and off it? Prints a short human-readable report and exits non-zero
# if not.
#
# Lives here rather than inside the checking workflow so it can be run by hand
# on the box while troubleshooting — the moment you most want it is the moment
# you are already SSHed in. `.github/workflows/backup-check.yml` runs this over
# SSH once a day and relays whatever it prints.
#
# This is the alerting half of the backup story: backup.sh failing loudly only
# helps if something reads cron's mail, and nothing does. A missed night shows
# up here as a stale age, which fails a workflow, which sends e-mail.
set -uo pipefail

APP_DIR=${APP_DIR:-/opt/art-lessons}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/art-lessons}
DB_NAME=${DB_NAME:-art_lessons}
# A daily backup plus slack for a slow night and a delayed check — anything
# older than this means a run was skipped or died.
MAX_AGE_HOURS=${MAX_AGE_HOURS:-26}

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

status=0
problem() { echo "PROBLEM: $*"; status=1; }

newest=$(ls -1t "$BACKUP_DIR"/"$DB_NAME"-*.dump 2>/dev/null | head -1)
if [ -z "$newest" ]; then
  problem "no dumps at all in $BACKUP_DIR"
else
  age_seconds=$(( $(date +%s) - $(stat -c %Y "$newest") ))
  age_hours=$((age_seconds / 3600))
  size_mb=$(( $(stat -c %s "$newest") / 1024 / 1024 ))
  count=$(ls -1 "$BACKUP_DIR"/"$DB_NAME"-*.dump 2>/dev/null | wc -l)
  echo "local:  $newest"
  echo "        ${age_hours}h old, ${size_mb} MB, ${count} kept"
  if [ "$age_hours" -ge "$MAX_AGE_HOURS" ]; then
    problem "newest local dump is ${age_hours}h old (limit ${MAX_AGE_HOURS}h)"
  fi
  # An empty file passes every freshness check ever written, so check the one
  # property that actually distinguishes a dump from a placeholder.
  if [ ! -s "$newest" ]; then
    problem "newest local dump is empty"
  fi
fi

if [ -z "${BACKUP_REMOTE:-}" ]; then
  problem "BACKUP_REMOTE is not configured — nothing is stored off this VPS, so a disk failure loses everything"
else
  echo "remote: $BACKUP_REMOTE"
  if ! remote_recent=$(rclone lsf --max-age "${MAX_AGE_HOURS}h" "$BACKUP_REMOTE" 2>&1); then
    problem "cannot list $BACKUP_REMOTE — $remote_recent"
  elif [ -z "$remote_recent" ]; then
    problem "no object newer than ${MAX_AGE_HOURS}h in $BACKUP_REMOTE — uploads have stopped"
  else
    echo "        $(printf '%s\n' "$remote_recent" | wc -l) object(s) newer than ${MAX_AGE_HOURS}h"
  fi
fi

# Free space is what turns a working backup into a failing one, silently and
# on its own schedule — worth seeing on a good day, not just a bad one.
echo "disk:   $(df -h --output=avail "$BACKUP_DIR" | tail -1 | tr -d ' ') free on $BACKUP_DIR"

[ "$status" -eq 0 ] && echo "OK: a verified backup exists both here and off-site"
exit "$status"
