# LF Certification Training

A learning platform that takes a learner from zero to **Golden Kubestronaut**: all 17 CNCF and Linux
Foundation certifications passed and current. Lessons, question banks and timed mocks for the
multiple-choice exams; disposable, auto-graded lab environments for the performance-based ones. Free for
learners, run on $100 a month of credit on each of Azure and AWS.

See the [plan](https://claude.ai/artifact/99Eiqhkj36HSbaKaLF61Ye) and the
[architecture decision records](docs/adr/README.md).

## Layout

| Folder | What it holds |
|--------|---------------|
| [`content/`](content/README.md) | Curriculum YAML for the 17 certs, lessons, question banks and lab definitions |
| [`platform/packages/curriculum`](platform/packages/curriculum) | Curriculum schema, loader, queries, source verification and Postgres ingest |
| [`platform/packages/curriculum-mcp`](platform/packages/curriculum-mcp) | Local read-only MCP server over the curriculum |
| [`platform/packages/labs`](platform/packages/labs) | Lab session rules shared by the app and the controller: statuses, scoring, allowance, terminal tokens |
| [`platform/apps/web`](platform/apps/web) | LF Cert Trainer, the Next.js study app |
| [`platform/apps/lab-controller`](platform/apps/lab-controller) | Starts, grades and deletes lab clusters (k3s in Docker locally) and relays the terminal |
| [`platform/lab-image`](platform/lab-image) | The lab tools image: workstation terminal (ttyd, tmux, kubectl, helm) and the grader (Chainsaw) |
| [`infra/`](infra/README.md) | Terraform for the always-on Azure platform and the budgets on both clouds |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records |

## Run it locally with Docker

Everything runs on your machine: Postgres, the web app, the lab controller, and one k3s cluster per lab
session, all in Docker. You need Docker with Compose v2 and about 4 GB of free memory.

```sh
docker compose up --build
```

Then open http://localhost:3000 and sign in as one of the sample learners below. The first start builds
three images and pulls k3s, so give it a few minutes; later starts take seconds. A lab boots in about
10 to 30 seconds. Data is kept in the `pgdata` volume across restarts (`docker compose down -v` wipes it).
Settings and their defaults are in [`.env.example`](.env.example); copy it to `.env` to change them.

Emails the app sends (sign-up verification and password reset links) go to a local test inbox, [Mailpit](https://mailpit.axllent.org),
at http://localhost:8025. Nothing reaches real addresses unless you set `SMTP_URL` in `.env` to a real provider.

Lab containers run privileged (k3s needs it), are labelled `lfct.managed=true`, and are deleted when the
lab ends. A lab can boot up to three clusters (one k3s container each, about 600 MB of memory apiece). The
lab player's Documentation tab shows kubernetes.io and helm.sh through the controller at
`http://<site>.localhost:3001`, so it needs internet access and a browser that resolves `*.localhost` (Chrome,
Edge and Firefox do). The controller's sweeper removes anything left over, also after a crash. To remove every lab
container by hand: `docker rm -f $(docker ps -aq --filter label=lfct.managed=true)`.

The images are small on purpose: `web` is the Next.js standalone server, and `setup` and `lab-controller` are
single files bundled with esbuild (`pnpm bundle`), each on plain Alpine with only the node binary, running as a
non-root user. The lab workstation image stays on Ubuntu so the terminal feels like the exam's.

## Develop

Needs Node.js 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm curriculum:validate        # schema, weights, ids and content tags
pnpm test                       # unit tests (set TEST_DATABASE_URL to include the Postgres ingest tests)
pnpm curriculum:verify-sources  # re-check the YAML against the pinned cncf/curriculum PDFs (needs git and network)
```

Load the curriculum into a local Postgres:

```sh
docker run -d --name lfct-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm curriculum:ingest
```

### Web app

LF Cert Trainer runs against a local Postgres with the curriculum, the sample content and four sample
learners:

```sh
docker run -d --name lfct-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
docker exec lfct-pg createdb -U postgres lfct
cp platform/apps/web/.env.example platform/apps/web/.env.local   # then set BETTER_AUTH_SECRET
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/lfct
pnpm --filter @lfct/web db:migrate   # app tables (auth, progress, review)
pnpm curriculum:ingest               # curriculum, lessons and questions, sample set included
pnpm --filter @lfct/web db:seed      # sample learners
pnpm --filter @lfct/web dev          # http://localhost:3000
```

To work on labs without Docker containers per session, run the lab controller with the fake provider (no
real cluster; type `solve` in its terminal to pass every check):

```sh
export LAB_CONTROLLER_SECRET=dev-controller-secret LAB_TOKEN_SECRET=dev-token-secret-at-least-32-characters
LAB_PROVIDER=fake pnpm --filter @lfct/lab-controller dev    # :3001, uses DATABASE_URL
```

With `LAB_PROVIDER=docker` (the default) the controller starts real k3s clusters on your Docker and needs
the tools image first: `docker compose build lab-tools`. Check that every lab boots, fails before it is
solved and passes with its reference solution:

```sh
pnpm --filter @lfct/lab-controller selftest            # all labs and mock exams, or name ids
```

Sample learners all use the password `sample-password-123`:

| Email | Stage |
|-------|-------|
| `new@example.com` | Just signed up, no answers yet |
| `mid@example.com` | KCSA and CKAD passed, KCNA expiring, CKA booked, 10 days of CKA practice and a review queue |
| `golden@example.com` | All 17 certs held, KCSA expiring |
| `admin@example.com` | Admin: content editor (Admin > Content), ingest runs, flag queue, coverage, users |

Sign-up works without a mail server: in development the verify page shows the emailed link, and with
`SMTP_URL=smtp://localhost:1025` plus `docker compose up -d mailpit` the emails also land in the local inbox. End-to-end tests (Playwright with axe accessibility checks) build the app and reset a separate
database:

```sh
pnpm --filter @lfct/web build
E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/lfct_e2e pnpm --filter @lfct/web e2e
```

### Curriculum MCP server

`.mcp.json` registers `lfct-curriculum` for Claude Code in this repository. After `pnpm install` it offers
`list_certs`, `get_objectives`, `get_competency`, `search_competencies` and `coverage_gaps`. To run it by
hand: `pnpm mcp:curriculum`.

## Roadmap

| Phase | Target | Scope |
|-------|--------|-------|
| 0 | Dec 2026 | Repository, ADRs, curriculum data and ingest, curriculum MCP, Terraform skeleton (done) |
| 1 | Jan 2027 | Study MVP: web app, sign-in, path map, curriculum browser, lessons, question bank (built, with sample content) |
| 2 | Feb 2027 | Tier 1 labs, lab player, grading, hints, allowance, sweeper (built, running locally on Docker with sample labs; cloud hosting later) |
| 3 | Mar-Apr 2027 | VM labs (kubeadm clusters, Linux VMs) |
| 4 | May-Jun 2027 | Project labs and mock exams (practical mock exam built early, running locally on Docker with two sample CKA mocks) |
| 5 | later | Waitlist, spend dashboard, running fully on free credits |
