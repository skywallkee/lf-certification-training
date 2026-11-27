#!/bin/sh
# Runs inside the db-backup service (the Postgres image): a backup when the stack starts, then one every
# BACKUP_INTERVAL_HOURS, into /backups (./backups on the host). Keeps the newest BACKUP_KEEP automatic backups;
# on-demand ones (scripts/db-backup.sh) are never pruned. BACKUP_INTERVAL_HOURS=0 turns automatic backups off.
# With BACKUP_COPY=on (self-hosting: BACKUP_COPY_DIR in .env) each backup is also copied to /backups-copy, another
# disk or a NAS share, pruned the same way, so losing one disk does not lose the backups.
set -eu
umask 077  # backups hold password hashes and learner data
interval="${BACKUP_INTERVAL_HOURS:-24}"
keep="${BACKUP_KEEP:-7}"

if [ "$interval" = "0" ]; then
  echo "Automatic backups are off (BACKUP_INTERVAL_HOURS=0)."
  exec sleep infinity
fi

backup() {
  ts=$(date -u +%Y%m%d-%H%M%S)
  tmp="/backups/.auto-lfct-$ts.dump.part"
  # Custom format: compressed, and pg_restore can restore it into an empty or existing database.
  if pg_dump --format=custom --no-owner --file="$tmp"; then
    mv "$tmp" "/backups/auto-lfct-$ts.dump"
    echo "Backed up the database to backups/auto-lfct-$ts.dump"
  else
    rm -f "$tmp"
    echo "Backup failed; trying again at the next interval." >&2
    return 0
  fi
  # Newest first; delete everything after the first $keep.
  ls -1t /backups/auto-lfct-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f "$old" && echo "Removed old backup ${old#/backups/}"
  done
  if [ "${BACKUP_COPY:-}" = "on" ]; then
    if cp "/backups/auto-lfct-$ts.dump" "/backups-copy/.auto-lfct-$ts.dump.part" && mv "/backups-copy/.auto-lfct-$ts.dump.part" "/backups-copy/auto-lfct-$ts.dump"; then
      echo "Copied it to the second backup folder"
      ls -1t /backups-copy/auto-lfct-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do rm -f "$old"; done
    else
      rm -f "/backups-copy/.auto-lfct-$ts.dump.part"
      echo "Could not copy the backup to the second folder (BACKUP_COPY_DIR); is it mounted and writable?" >&2
    fi
  fi
}

until pg_isready -q; do sleep 2; done
while true; do
  backup
  sleep "$((interval * 3600))"
done
