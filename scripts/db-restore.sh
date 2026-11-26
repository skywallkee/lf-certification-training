#!/bin/sh
# Restores the local Docker stack's database from a backup made by scripts/db-backup.sh or the db-backup service.
#
#   scripts/db-restore.sh latest                         the newest backup in backups/
#   scripts/db-restore.sh backups/lfct-20261126-091500.dump
#   scripts/db-restore.sh -y latest                      without asking first
#
# Every account and all progress are replaced by the backup's. The current database is saved first to
# backups/pre-restore-<UTC time>.dump, so you can go back. The web app, the lab controller and the backup service
# are stopped during the restore and started again after it; labs that were running are ended.
set -eu
umask 077  # backups hold password hashes and learner data
cd "$(dirname "$0")/.."

yes=no
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then
  yes=yes
  shift
fi
src="${1:-}"
if [ -z "$src" ]; then
  echo "Usage: scripts/db-restore.sh [-y] <backup file | latest>" >&2
  echo "Backups in backups/:" >&2
  ls -1t backups/*.dump 2>/dev/null | head -n 10 >&2 || echo "  (none)" >&2
  exit 2
fi
if [ "$src" = "latest" ]; then
  src=$(ls -1t backups/*.dump 2>/dev/null | head -n 1 || true)
  [ -n "$src" ] || { echo "No backups in backups/." >&2; exit 1; }
fi
[ -f "$src" ] || { echo "No such file: $src" >&2; exit 1; }

if ! docker compose exec -T postgres pg_isready -q -U postgres < /dev/null; then
  echo "Postgres is not running. Start it first: docker compose up -d postgres" >&2
  exit 1
fi
# Check the archive before touching anything.
if ! docker compose exec -T postgres pg_restore --list < "$src" > /dev/null; then
  echo "$src is not a backup pg_restore can read." >&2
  exit 1
fi

if [ "$yes" != yes ]; then
  printf 'Replace the database with %s? Every account and all progress since then are lost. [y/N] ' "$src"
  read -r answer
  case "$answer" in y | Y | yes | YES) ;; *) echo "Nothing changed."; exit 1 ;; esac
fi

safety="backups/pre-restore-$(date -u +%Y%m%d-%H%M%S).dump"
mkdir -p backups
if docker compose exec -T postgres psql -U postgres -tAc "select 1 from pg_database where datname = 'lfct'" < /dev/null | grep -q 1; then
  docker compose exec -T postgres pg_dump -U postgres -d lfct --format=custom --no-owner < /dev/null > "$safety"
  echo "Saved the current database to $safety"
fi

echo "Stopping the web app, the lab controller and the backup service…"
docker compose stop web lab-controller db-backup > /dev/null 2>&1 || true

echo "Restoring $src…"
docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "drop database if exists lfct with (force)" -c "create database lfct" < /dev/null
if ! docker compose exec -T postgres pg_restore -U postgres -d lfct --no-owner --exit-on-error < "$src"; then
  echo "The restore failed. Your previous database is in $safety: scripts/db-restore.sh -y $safety" >&2
  exit 1
fi

# Lab containers from before the restore no longer match the database; the controller's sweeper would remove
# them too, this just does it now.
docker rm -f $(docker ps -aq --filter label=lfct.managed=true) > /dev/null 2>&1 || true

echo "Starting the app again…"
docker compose up -d > /dev/null
echo "Restored the database from $src."
