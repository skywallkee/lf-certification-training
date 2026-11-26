#!/bin/sh
# Backs up the local Docker stack's database now, to backups/lfct-<UTC time>.dump (or the file you name).
#
#   scripts/db-backup.sh                     backups/lfct-20261126-091500.dump
#   scripts/db-backup.sh ~/lfct-before.dump  a file of your choice
#
# Needs the stack running (docker compose up). The file is a pg_dump custom-format archive; restore it with
# scripts/db-restore.sh. These backups are never deleted automatically.
set -eu
umask 077  # backups hold password hashes and learner data
cd "$(dirname "$0")/.."

out="${1:-backups/lfct-$(date -u +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$out")"
tmp="$out.part"

if ! docker compose exec -T postgres pg_isready -q -U postgres -d lfct < /dev/null; then
  echo "Postgres is not running. Start the stack first: docker compose up -d" >&2
  exit 1
fi
if docker compose exec -T postgres pg_dump -U postgres -d lfct --format=custom --no-owner < /dev/null > "$tmp"; then
  mv "$tmp" "$out"
  echo "Backed up the database to $out ($(du -h "$out" | cut -f1))"
else
  rm -f "$tmp"
  echo "Backup failed." >&2
  exit 1
fi
