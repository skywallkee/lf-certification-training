#!/bin/sh
# Writes .env for hosting LF Cert Trainer on this server over Tailscale (see docs/self-hosting.md):
# random secrets, the server's Tailscale HTTPS name for every browser-facing URL, and COMPOSE_FILE so a plain
# `docker compose up -d` uses compose.selfhost.yaml. Run it once from the repository root.
#
#   scripts/selfhost-init.sh you@example.com                        Tailscale name from `tailscale status`
#   scripts/selfhost-init.sh you@example.com server.tail1234.ts.net name given by hand
#   LAB_MAX_ACTIVE_SESSIONS=4 LAB_MAX_CLUSTERS=8 scripts/selfhost-init.sh ...   other lab limits (default 3 and 6)
#
# Works in Git Bash on Windows too.
#
# It never overwrites an existing .env: move it away first if you mean to start over (the database keeps the
# POSTGRES_PASSWORD it was created with, so keep that value when you do).
set -eu
umask 077  # .env holds the secrets

[ -f compose.selfhost.yaml ] || { echo "Run this from the repository root." >&2; exit 1; }
if [ -e .env ]; then
  echo ".env already exists; not touching it. Move it away to generate a new one." >&2
  exit 1
fi

admin="${1:-}"
case "$admin" in
  *@*) ;;
  *) echo "Usage: scripts/selfhost-init.sh <your email> [tailscale name]" >&2; exit 1 ;;
esac

host="${2:-}"
if [ -z "$host" ] && command -v tailscale > /dev/null 2>&1; then
  py=$(command -v python3 || command -v python || true)
  if [ -n "$py" ]; then
    host=$(tailscale status --json 2> /dev/null | "$py" -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2> /dev/null || true)
  fi
fi
case "$host" in
  *.ts.net) ;;
  "") echo "Could not read this server's Tailscale name. Is Tailscale up (sudo tailscale up)? Or pass it: scripts/selfhost-init.sh $admin server.tailXXXX.ts.net" >&2; exit 1 ;;
  *) echo "Note: $host is not a *.ts.net name; using it anyway." >&2 ;;
esac

secret() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

cat > .env <<ENV
# LF Cert Trainer on this server, over Tailscale. Written by scripts/selfhost-init.sh on $(date -u +%Y-%m-%d).
# Keep this file private: it holds the secrets. See docs/self-hosting.md.
COMPOSE_FILE=compose.yaml:compose.selfhost.yaml

# Browser-facing URLs: tailscale serve (scripts/tailscale-serve.sh) gives each one HTTPS on the tailnet.
APP_URL=https://$host
LAB_TERMINAL_URL=wss://$host:8443
LAB_DOCS_URL=kubernetes.io=https://$host:8444,helm.sh=https://$host:8445

# The account with this email becomes the admin when it signs up.
ADMIN_EMAILS=$admin

BETTER_AUTH_SECRET=$(secret)
LAB_CONTROLLER_SECRET=$(secret)
LAB_TOKEN_SECRET=$(secret)
POSTGRES_PASSWORD=$(secret)

# Email (sign-up verification, password resets, reminders). Without SMTP_URL it lands in the Mailpit inbox on this
# server only (http://127.0.0.1:4025). Any SMTP provider works, for example a Gmail app password:
# SMTP_URL=smtps://you%40gmail.com:app-password@smtp.gmail.com:465
# MAIL_FROM=LF Cert Trainer <you@gmail.com>

# Labs at once on this machine: sessions, and clusters in all (a 3-cluster mock counts 3). 3 and 6 suit 16 GB.
LAB_MAX_ACTIVE_SESSIONS=${LAB_MAX_ACTIVE_SESSIONS:-3}
LAB_MAX_CLUSTERS=${LAB_MAX_CLUSTERS:-6}
# LAB_MONTHLY_MINUTES=600
# LAB_CLUSTER_MEMORY_MB=1536

# Backups go to ./backups once a day, newest 14 kept. A second copy on another disk or a NAS mount:
# BACKUP_COPY_DIR=/mnt/backup-disk/lfct
BACKUP_UID=$(id -u)
BACKUP_GID=$(id -g)

# Optional GitHub sign-in (callback URL: https://$host/api/auth/callback/github)
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
ENV

echo "Wrote .env for https://$host (admin: $admin)."
echo "Next: docker compose up -d --build, then scripts/tailscale-serve.sh"
