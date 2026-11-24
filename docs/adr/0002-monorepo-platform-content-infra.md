# 2. One repository with platform, content and infra folders

Date: 2026-11-24 · Status: Accepted

## Context

The plan describes three repositories: platform (app, MCP, grader, lab controller), content (curriculum,
lessons, questions, labs) and infra (Terraform, Packer). One repository exists, and the team is one person
plus Claude. Three repositories would triple CI setup and make cross-cutting changes (a schema change plus
the content that uses it) span several pull requests.

## Decision

Use one repository with three top-level folders that mirror the planned split:

- `platform/`: TypeScript workspace (pnpm). `packages/` for libraries and tools, `apps/` for deployables.
- `content/`: curriculum YAML, lessons (MDX), question banks and lab definitions.
- `infra/`: Terraform (and Packer from Phase 3).

Content stays independent of app releases because the app reads it from Postgres, loaded by the ingest
job, not from its own bundle.

## Consequences

- CI can run only the jobs a change touches by path filters when the suite grows.
- Splitting `content/` into its own repository later stays possible: nothing in `platform/` imports files
  from `content/` except the ingest and MCP tools, which take the content directory as a parameter.
