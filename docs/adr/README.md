# Architecture decision records

Short records of decisions that shape the platform, in the format from Michael Nygard's
"Documenting Architecture Decisions": context, decision, consequences. The full reasoning lives in the
[plan](https://claude.ai/artifact/99Eiqhkj36HSbaKaLF61Ye); these records are the part that must stay true
in the code. To change a decision, add a new record that supersedes the old one.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-monorepo-platform-content-infra.md) | One repository with platform, content and infra folders | Accepted |
| [0003](0003-always-on-footprint.md) | Only the web app and Postgres are always on, on Azure | Accepted |
| [0004](0004-on-demand-labs-two-clouds.md) | Labs are disposable VMs on AWS and Azure under monthly caps | Accepted |
| [0005](0005-curriculum-as-data.md) | The curriculum is data, verified against cncf/curriculum | Accepted |
| [0006](0006-typescript-toolchain.md) | TypeScript toolchain and pinned versions | Accepted |
| [0007](0007-local-curriculum-mcp.md) | The curriculum MCP server runs locally over stdio | Accepted |
| [0008](0008-content-from-public-sources-only.md) | Content comes from public sources only | Accepted |
| [0009](0009-phase-1-study-app.md) | Phase 1 study app: shape and shortcuts | Accepted |
| [0010](0010-phase-2-labs-on-local-docker.md) | Phase 2 labs run on local Docker first | Accepted |
| [0011](0011-practical-mock-exam.md) | The practical mock exam is a long lab session with a mode | Accepted |
| [0012](0012-resumable-players-and-image-cache.md) | Players resume from the server, and k3s imports cached images at boot | Accepted |
| [0013](0013-admin-content-authoring.md) | Admins author content in the app; the database copy wins over files | Accepted |
| [0016](0016-readiness-from-all-evidence.md) | Readiness counts labs, mock exams and lessons; review sessions mix certs | Accepted |
| [0019](0019-study-plans-and-reminders.md) | Weekly study plans from the exam date, and opt-in reminder emails | Accepted |
| [0020](0020-admin-analytics-from-existing-tables.md) | Admin analytics are computed from existing tables, with a seeded sample cohort | Accepted |
