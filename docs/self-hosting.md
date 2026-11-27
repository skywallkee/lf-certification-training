# Host LF Cert Trainer on your own server

This guide runs the whole platform on one Linux server at home, for you and a few people you invite, reached only
over [Tailscale](https://tailscale.com). Nothing is opened on your router and no domain is needed: the app lives at
`https://<server>.<your-tailnet>.ts.net`, with a real HTTPS certificate, for devices in your tailnet only.

It is written for **CentOS Stream 9** (Rocky Linux and AlmaLinux 9 work the same way) on a machine with about
**8 cores and 16 GB of RAM**, which runs three labs at once. Why it is built this way: [ADR 0024](adr/0024-self-hosting-over-tailscale.md).

| What | Where |
|------|-------|
| The app | `https://<server>.ts.net` |
| Lab terminal (WebSocket) | `https://<server>.ts.net:8443` |
| Docs pane: kubernetes.io, helm.sh | `https://<server>.ts.net:8444`, `:8445` |
| Mailpit fallback inbox, Postgres | `127.0.0.1:4025`, `127.0.0.1:4432` on the server only |
| Backups | `backups/` in the repository folder, plus an optional second copy |

> **Trust the people you invite.** Lab clusters run as privileged containers, and a learner has full `kubectl`
> access inside their cluster. Someone determined could use that to become root on the server. That is fine for
> you and a few friends on a private tailnet; it is the reason this setup is not meant for public sign-ups.
> Run it on a machine (or a VM) that holds nothing else you care about.

## 1. Prepare CentOS

Check the version (`cat /etc/os-release`). CentOS Linux 7 and 8 no longer get security updates; use Stream 9 or
later.

Install **Docker CE** from Docker's repository. Podman, CentOS's default, does not run the privileged k3s
containers the labs use.

```sh
sudo dnf remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate \
  docker-logrotate docker-engine podman runc   # whatever of these is installed
sudo dnf -y install dnf-plugins-core git
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"     # then log out and back in
docker compose version              # 2.24 or later
```

Several k3s clusters on one machine need more inotify watchers than the default, or labs fail with "too many open
files":

```sh
sudo tee /etc/sysctl.d/90-lfct.conf <<'EOF'
fs.inotify.max_user_instances = 1024
fs.inotify.max_user_watches = 524288
EOF
sudo sysctl --system
```

Leave **SELinux** enforcing and **firewalld** on: everything listens on 127.0.0.1 and Tailscale brings its own
traffic in, so there is nothing to open. The backup folders are mounted with `:z` so SELinux allows the writes.

Plan for about **40 GB of free disk** (images, k3s images, the database and backups).

## 2. Install Tailscale

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
sudo tailscale up
```

In the [Tailscale admin console](https://login.tailscale.com/admin/dns), turn on **MagicDNS** and **HTTPS
Certificates**. `tailscale status` now shows the server; its full name is under `DNSName` in
`tailscale status --json`.

## 3. Get the app and configure it

```sh
git clone https://github.com/skywallkee/lf-certification-training.git
cd lf-certification-training
scripts/selfhost-init.sh you@example.com
```

`selfhost-init.sh` writes `.env` (readable only by you) with random secrets, your Tailscale name in every URL, and
`COMPOSE_FILE=compose.yaml:compose.selfhost.yaml`, so plain `docker compose` commands use the self-hosting
settings. The email you pass becomes the admin account when you sign up with it. It never overwrites an existing
`.env`. Pass the name by hand if Tailscale is not up yet: `scripts/selfhost-init.sh you@example.com server.tail1234.ts.net`.

Open `.env` to set email (next section) and anything else; every option is commented there and in
[`.env.example`](../.env.example).

### Email

Sign-up verification and password resets need email that reaches real inboxes. Set an SMTP provider in `.env`:

```sh
# Gmail: turn on 2-step verification, create an app password, then (the password without spaces):
SMTP_URL=smtps://you%40gmail.com:the-app-password@smtp.gmail.com:465
MAIL_FROM=LF Cert Trainer <you@gmail.com>
```

Any provider with SMTP works (Brevo, Mailjet, SMTP2GO and others have free tiers): `smtps://` for TLS on 465,
`smtp://` for STARTTLS on 587. Write `@` in the user name as `%40`.

Without `SMTP_URL`, mail lands in the Mailpit inbox on the server, which only you can open (from your laptop:
`ssh -L 4025:127.0.0.1:4025 you@server`, then http://localhost:4025). That works for a couple of people if you
forward their verification links yourself.

## 4. Start it

```sh
docker compose up -d --build        # first build takes a while
docker compose ps                   # web, lab-controller, postgres, mailpit and db-backup running; setup exited 0
scripts/tailscale-serve.sh          # HTTPS on the tailnet: 443, 8443, 8444, 8445
```

Open `https://<server>.ts.net` from any device in your tailnet, sign up with the admin email, and start a lab to
check that the terminal and the Documentation tab work. Docker starts on boot, the containers restart on their
own, and `tailscale serve` keeps its settings across reboots.

## 5. Invite people

Each person installs Tailscale and signs in with their own account. Then either:

- **Share the machine** (admin console > Machines > the server > Share): they see only this server, nothing else
  of your network. Good for a few friends.
- or **invite them to your tailnet** as users.

Either way they can reach every port the server listens on in the tailnet. The app's ports are the only ones
`tailscale serve` publishes, but SSH or other services bound to all addresses would be reachable too. To limit
them to the app, add an access rule in the admin console (Access controls), for example with the server tagged
`tag:lfct`:

```json
{ "action": "accept", "src": ["group:learners"], "dst": ["tag:lfct:443,8443,8444,8445"] }
```

They then sign up in the app like anyone else.

## Labs at once, and the waiting line

The defaults suit 16 GB: **3 labs or mock attempts at once, 6 clusters in all** (a three-cluster mock counts 3),
each cluster capped at 1.5 GB. When a start does not fit, the learner's button becomes **Join the line**; their
place shows on the page (and in the tab title), and their lab starts by itself on their turn. The line is first
come, first served. A learner who closes the page drops out after about 45 seconds. Admin > Labs shows slots,
clusters and how many are waiting.

Change it in `.env` and run `docker compose up -d`:

| RAM | `LAB_MAX_ACTIVE_SESSIONS` | `LAB_MAX_CLUSTERS` |
|-----|-----|-----|
| 8 GB | 1 | 3 |
| 16 GB | 3 | 6 |
| 32 GB | 6 | 14 |

`LAB_MONTHLY_MINUTES` (600) is each learner's monthly lab time; `MOCK_EXAMS_PER_MONTH` and
`MOCK_PRACTICE_PER_MONTH` limit mock attempts.

## Backups

The `db-backup` service dumps the database to `backups/` when the stack starts and every 24 hours, keeping the
newest 14. Put a second copy on another disk or a NAS share mounted on the server:

```sh
# .env
BACKUP_COPY_DIR=/mnt/backup-disk/lfct
```

Back up by hand before changes, and restore, with the same scripts as on a laptop (they read `.env`):

```sh
scripts/db-backup.sh                 # backups/lfct-<time>.dump, never deleted automatically
scripts/db-restore.sh latest         # asks first, and saves the current database before replacing it
```

Keep `.env` safe too (a password manager is a good place): the backups are useless without the
`POSTGRES_PASSWORD`, and sign-ins break without `BETTER_AUTH_SECRET`.

## Update

```sh
cd lf-certification-training
scripts/db-backup.sh
git pull
docker compose up -d --build
```

Migrations and content load run automatically in the `setup` step. Running labs end when the controller restarts.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| A required variable is missing | `docker compose config` names it; run `scripts/selfhost-init.sh` or set it in `.env` |
| The page does not load | `tailscale serve status`; `docker compose ps`; is MagicDNS on, and is the device in the tailnet? |
| Terminal stays on "connecting" | `LAB_TERMINAL_URL` must be `wss://<server>.ts.net:8443`, and port 8443 must be in `tailscale serve status` |
| The Documentation tab is blank | `LAB_DOCS_URL` must name 8444 and 8445 on the same server name; ports 4011 and 4012 must be up (`docker compose logs lab-controller`) |
| Labs fail with "too many open files" | the inotify settings in step 1 |
| Labs never start | `docker compose logs lab-controller`; free memory with `free -h` |
| No emails arrive | `docker compose logs web` shows SMTP errors; check `SMTP_URL`, and the Mailpit inbox |

Logs: `docker compose logs -f web lab-controller` (each container keeps at most 50 MB of logs).
