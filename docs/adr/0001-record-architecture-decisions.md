# 1. Record architecture decisions

Date: 2026-11-24 · Status: Accepted

## Context

The platform is built in phases, partly by Claude sessions that start without the context of earlier ones.
Decisions made in planning (clouds, budget, what stays on) must survive into every later change.

## Decision

Keep architecture decision records in `docs/adr/`, numbered, one decision per file. A change of mind is a
new record that supersedes the old one; old records are not rewritten.

## Consequences

Anyone (or any agent) changing infrastructure, hosting or the data model reads the relevant record first.
Pull requests that contradict a record either add a superseding record or are revised.
