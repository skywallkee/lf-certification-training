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
| [`content/`](content/README.md) | Curriculum YAML for the 17 certs, and later lessons, questions and lab definitions |
| [`platform/packages/curriculum`](platform/packages/curriculum) | Curriculum schema, loader, queries, source verification and Postgres ingest |
| [`platform/packages/curriculum-mcp`](platform/packages/curriculum-mcp) | Local read-only MCP server over the curriculum |
| `platform/apps/` | The Next.js web app (Phase 1) |
| [`infra/`](infra/README.md) | Terraform for the always-on Azure platform and the budgets on both clouds |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records |

## Getting started

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

### Curriculum MCP server

`.mcp.json` registers `lfct-curriculum` for Claude Code in this repository. After `pnpm install` it offers
`list_certs`, `get_objectives`, `get_competency`, `search_competencies` and `coverage_gaps`. To run it by
hand: `pnpm mcp:curriculum`.

## Roadmap

| Phase | Target | Scope |
|-------|--------|-------|
| 0 | Dec 2026 | Repository, ADRs, curriculum data and ingest, curriculum MCP, Terraform skeleton (this) |
| 1 | Jan 2027 | Study MVP: web app, sign-in, path map, curriculum browser, lessons, question bank |
| 2 | Feb 2027 | Tier 1 labs (vCluster on a shared k3s node), sweeper |
| 3 | Mar-Apr 2027 | VM labs (kubeadm clusters, Linux VMs) |
| 4 | May-Jun 2027 | Project labs and mock exams |
| 5 | later | Waitlist, spend dashboard, running fully on free credits |
