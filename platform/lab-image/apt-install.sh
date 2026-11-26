#!/bin/sh
# apt-get update + install that rides out Ubuntu mirror hiccups ("Mirror sync in progress?", hash or size
# mismatches, timeouts). Bind-mounted into RUN steps, so it never lands in the image.
#   usage: sh /tmp/apt-install.sh pkg...
# APT_MIRROR (optional) replaces archive.ubuntu.com, e.g. http://de.archive.ubuntu.com/ubuntu
set -eu

# Per-file retries for transient network errors, and timeouts so a stalled mirror fails fast.
printf '%s\n' 'Acquire::Retries "5";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' \
  > /etc/apt/apt.conf.d/80-retries

if [ -n "${APT_MIRROR:-}" ]; then
  sed -i "s#http://archive.ubuntu.com/ubuntu/\{0,1\}#${APT_MIRROR%/}/#" /etc/apt/sources.list.d/ubuntu.sources
fi

# apt-get update exits non-zero when an index fails its checksum mid-sync; a fresh attempt a little later
# usually gets a consistent set. Backoff: 10, 20, 40, 80 s (about 2.5 minutes over 5 attempts).
attempts=5 n=1 delay=10
until apt-get update && apt-get install -y --no-install-recommends "$@"; do
  if [ "$n" -ge "$attempts" ]; then
    echo "apt: still failing after $attempts attempts. Retry later, or pass --build-arg APT_MIRROR=<mirror>." >&2
    exit 1
  fi
  echo "apt: attempt $n/$attempts failed (mirror sync in progress?), retrying in ${delay}s" >&2
  rm -rf /var/lib/apt/lists/*
  sleep "$delay"
  n=$((n + 1)) delay=$((delay * 2))
done
