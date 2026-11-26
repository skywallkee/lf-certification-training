# Database backups

Backups of the local Postgres database (`lfct`) land here. They hold every learner's account and progress, so
they are kept out of git and out of Docker builds.

- `auto-lfct-*.dump`: taken by the `db-backup` service when the stack starts and then every
  `BACKUP_INTERVAL_HOURS` (default 24). Only the newest `BACKUP_KEEP` (default 7) are kept.
- `lfct-*.dump`: taken on demand with `scripts/db-backup.sh`; never deleted automatically.
- `pre-restore-*.dump`: the database as it was just before a restore, so a restore can be undone.

Restore one with `scripts/db-restore.sh <file>` (or `latest`). See the README's "Back up and restore" section.
