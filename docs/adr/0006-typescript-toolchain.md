# 6. TypeScript toolchain and pinned versions

Date: 2026-11-24 · Status: Accepted

## Context

The plan picks TypeScript for the product and tooling and asks for exact versions when the repository is
created. Versions were checked on npm and in Context7 on 24 Nov 2026.

## Decision

- Node.js 22 LTS (`.nvmrc`), pnpm 10 workspaces, ES modules.
- TypeScript **6.0**, not 7.0: typescript-eslint 8.74 supports TypeScript below 6.1.
- Source runs directly with `tsx` (no build step for tools); `tsc --noEmit` typechecks.
- zod 4 for schemas, `yaml` for parsing, Vitest 5 for tests, ESLint 10 with typescript-eslint.
- Drizzle ORM **0.45** with drizzle-kit migrations, not the v1 beta. Better Auth (Phase 1) uses its
  Drizzle adapter with `provider: "pg"` for 0.45; moving to Drizzle v1 later means switching to the
  relations-v2 adapter at the same time.
- MCP TypeScript SDK **2.4** (`@modelcontextprotocol/server`), `registerTool` with zod schemas.
- Dependencies are pinned to exact versions; the lockfile is committed.

## Consequences

Upgrades are deliberate pull requests. Revisit TypeScript 7 when typescript-eslint supports it.
