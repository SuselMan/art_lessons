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
#
# (#555) It was blind for three weeks and nobody noticed, which is the exact
# failure this script exists to prevent. The off-site half captured rclone's
# stdout and stderr into one variable and tested it for "non-empty": rclone
# prints `NOTICE: Config file ... not found` to stderr on every run here (the
# remote is defined in the environment, so the missing file is normal), and
# that one line read as "1 object newer than 26h" while the bucket had not
# received a dump in days. Two lessons are baked in below: never let a tool's
# chatter stand in for its answer, and check for the *specific* object last
# night should have produced, not for "anything recent".
set -uo pipefail

APP_DIR=${APP_DIR:-/opt/art-lessons}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/art-lessons}
DB_NAME=${DB_NAME:-art_lessons}
# Same default as backup.sh — it reads the value from the same env files, and
# the check below only makes sense against the number rotation actually uses.
KEEP_LOCAL=${KEEP_LOCAL:-14}
# A daily backup plus slack for a slow night and a delayed check — anything
# older than this means a run was skipped or died.
MAX_AGE_HOURS=${MAX_AGE_HOURS:-26}

# Same pair backup.sh reads — see the comment there for why they are separate.
for env_file in "$APP_DIR/.env" "$APP_DIR/backup.env"; do
  [ -f "$env_file" ] || continue
  set -a
  # shellcheck disable=SC1091
  . "$env_file"
  set +a
done

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
  echo "        ${age_hours}h old, ${size_mb} MB, ${count} kept (rotation keeps $KEEP_LOCAL)"
  if [ "$age_hours" -ge "$MAX_AGE_HOURS" ]; then
    problem "newest local dump is ${age_hours}h old (limit ${MAX_AGE_HOURS}h)"
  fi
  # An empty file passes every freshness check ever written, so check the one
  # property that actually distinguishes a dump from a placeholder.
  if [ ! -s "$newest" ]; then
    problem "newest local dump is empty"
  fi
  # backup.sh rotates only after a successful upload, so more dumps on disk
  # than it keeps means uploads have been failing for as many nights as the
  # excess — and that the disk is filling up at a dump a night. This is what
  # turned the B2 storage cap into disk-pressure alerts on prod (#555), and it
  # is visible from the local directory alone, before the bucket is even asked.
  if [ "$count" -gt "$KEEP_LOCAL" ]; then
    problem "$count local dumps but rotation keeps $KEEP_LOCAL — backup.sh has not completed an upload for $((count - KEEP_LOCAL)) night(s)"
  fi
fi

if [ -z "${BACKUP_REMOTE:-}" ]; then
  problem "BACKUP_REMOTE is not configured — nothing is stored off this VPS, so a disk failure loses everything"
else
  echo "remote: $BACKUP_REMOTE"
  # stdout and stderr kept apart: only stdout is the listing. rclone's
  # NOTICE/ERROR lines go to stderr and are shown on failure, never counted.
  remote_err=$(mktemp)
  if ! remote_listing=$(rclone lsf "$BACKUP_REMOTE" 2>"$remote_err"); then
    problem "cannot list $BACKUP_REMOTE — $(tr '\n' ' ' < "$remote_err")"
  else
    remote_count=$(printf '%s\n' "$remote_listing" | grep -c .)
    echo "        $remote_count object(s) in the bucket"
    # The question is not "is there something recent" but "did last night's
    # dump arrive" — the same file, by name. A stale local dump was already
    # reported above; here a fresh local dump that never made it off the box is
    # exactly the failure mode backup.sh calls a failed run.
    if [ -n "$newest" ]; then
      newest_name=$(basename "$newest")
      if printf '%s\n' "$remote_listing" | grep -qxF "$newest_name"; then
        echo "        newest local dump is in the bucket"
      else
        problem "newest local dump $newest_name is not in $BACKUP_REMOTE — last night's upload failed (see: sudo journalctl -t grafetto-backup --since -2d)"
      fi
    fi
  fi
  rm -f "$remote_err"
fi

# Free space is what turns a working backup into a failing one, silently and
# on its own schedule — worth seeing on a good day, not just a bad one.
echo "disk:   $(df -h --output=avail "$BACKUP_DIR" | tail -1 | tr -d ' ') free on $BACKUP_DIR"

[ "$status" -eq 0 ] && echo "OK: a verified backup exists both here and off-site"
exit "$status"
