# 7. The curriculum MCP server runs locally over stdio

Date: 2026-11-24 · Status: Accepted

## Context

Claude writes lessons, questions and labs and needs the exact objectives, their weights and what is not
covered yet. Hosting an MCP server would add an always-on service and an auth surface.

## Decision

`@lfct/curriculum-mcp` is a read-only MCP server over stdio, registered in `.mcp.json`. It reads the YAML and
the content folders directly (no database), re-reading on every call so edits show up immediately. Tools:
`list_certs`, `get_objectives`, `get_competency`, `search_competencies`, `coverage_gaps`.

## Consequences

It works in any checkout with `pnpm install`, costs nothing to run, and cannot change data. If the web app
ever needs the same answers, it queries Postgres instead.
