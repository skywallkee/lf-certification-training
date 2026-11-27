# 0024. Self-hosting on a home server over Tailscale, with a waiting line for lab slots

Date: 2026-11-27
Status: Accepted

(Numbered 0024 because 0023 is taken by the lesson format change.)

## Context

The platform ran only on a laptop with `docker compose up` (ADR 0010); the cloud plan (ADR 0003, ADR 0004) is for
later. The owner has a home server (CentOS, about 8 cores and 16 GB of RAM) that can run two or three lab
clusters at once, and wants it to host the whole platform for themselves and a few invited people over
Tailscale, with nothing exposed to the internet.

Three things in the laptop setup do not carry over: every browser-facing URL assumed `localhost` (the docs pane
used `<site>.localhost`, which only resolves on the machine itself), a full machine refused new labs with "try
again later", and the defaults (sample learners, dev email links, well-known secrets) are only fit for a laptop.

## Decision

- **An overlay, not a second stack.** `compose.selfhost.yaml` layers on `compose.yaml`; `.env` sets
  `COMPOSE_FILE=compose.yaml:compose.selfhost.yaml`, so `docker compose up -d` and the backup scripts work as
  before. The overlay makes every secret, `APP_URL`, `ADMIN_EMAILS` and the lab URLs required, runs the web app
  with `APP_ENV=production` (which refuses default secrets and never shows email links), seeds nothing, caps
  container logs, caps each cluster's memory, and keeps Mailpit only as a server-side fallback inbox.
  `scripts/selfhost-init.sh` writes that `.env` with random secrets and the server's Tailscale name.
- **Tailscale serve is the only way in.** Every port stays on 127.0.0.1. `tailscale serve` gives HTTPS on the
  tailnet name: the app on 443, the terminal WebSocket on 8443, and one port per docs site (8444 kubernetes.io,
  8445 helm.sh). No router ports, no public tunnel, no domain.
- **Docs sites keep their own origins.** Tailscale names have no wildcard subdomains, so the docs pane cannot
  use `<site>.<name>`. Serving docs under a path of the app's origin was rejected: the docs sites' scripts would
  then run on the app's origin, with its cookies. Instead the controller listens on one extra port per site
  (`LAB_DOCS_PORTS`), and `LAB_DOCS_URL` accepts either the old template (`http://{host}.localhost:4001`) or one
  URL per site (`kubernetes.io=https://name:8444,helm.sh=https://name:8445`). The CSP frames exactly those
  origins, and the controller rewrites links inside the docs to the same URLs.
- **Capacity in sessions and clusters.** A lab or mock attempt takes one session slot and one cluster per kubectl
  context (a three-cluster mock takes three). `LAB_MAX_ACTIVE_SESSIONS` (3) and the new `LAB_MAX_CLUSTERS` (6 in
  the overlay, unset on a laptop) bound both. With about 600 MB to 1.5 GB per cluster, six clusters leave room for
  the OS, Postgres and the app on 16 GB.
- **A waiting line instead of a refusal.** When a start does not fit, "Start lab" (or "Prepare") becomes "Join the
  line" and the learner gets a place in `lab_queue` (one per learner; joining for another lab keeps the place).
  The rules are pure functions in `@lfct/labs/capacity`: strictly first come, first served, and nobody skips a
  first-in-line mock that needs more clusters than are free, so big attempts are not starved. A newcomer starts
  directly only when nobody is waiting. The waiting page checks in every 5 seconds; an entry not refreshed for 45
  seconds drops out, so a closed tab never blocks the line. On the learner's turn the page presses Start for
  them. Starting runs under a Postgres advisory lock, so simultaneous starts cannot overfill the server (before
  this, two starts at the same moment could).
- **Backups** keep the existing `db-backup` service (daily, newest 14 kept in the overlay) and add an optional
  second copy (`BACKUP_COPY_DIR`, e.g. another disk or a NAS mount).

## Consequences

- One server, one tailnet: access control is Tailscale's (machine sharing and ACLs), on top of the app's own
  accounts. Learners need the Tailscale app.
- Lab clusters are privileged containers, so anyone who can start a lab can, with effort, become root on the
  server. That is acceptable for a few trusted people on a private tailnet and is the main reason this setup is
  not meant for public sign-ups; the guide says so.
- Two docs sites fit the default ports; another site needs another `LAB_DOCS_PORTS` entry, `LAB_DOCS_URL` entry
  and `tailscale serve` port.
- Waiting needs the page open. There is no email or push when a slot frees up; with a few learners the wait is
  short and the page title shows the place in line.
- The cloud plan stays valid for later: the queue and the capacity limits apply to any provider.
