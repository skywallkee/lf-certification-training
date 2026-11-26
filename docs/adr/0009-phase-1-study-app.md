# 9. Phase 1 study app: shape and shortcuts

Date: 2026-11-24 · Status: Accepted

## Context

Phase 1 is the study MVP: sign-in, the path map, the curriculum browser, lessons, the question bank, review
and readiness. It must spend no cloud money, and the content format is expected to change while the app is
built, so it ships with mock content only. Several choices were made to keep it small; this record names
them so later phases can revisit them on purpose.

## Decision

1. **One Next.js app** in `platform/apps/web` (App Router, React Server Components, server actions,
   standalone output for a container). UI components live inside the app, in the shadcn/ui style on
   Tailwind v4. A shared `packages/ui` waits until a second app needs it.
2. **Better Auth** with the Drizzle adapter on the same Postgres: email and password with required email
   verification, optional GitHub, and the admin plugin for roles and disabling accounts. Sign-up is open.
3. **No mail provider yet.** Outgoing email is written to an `outbox_email` table and the log. In
   development the verify page shows the link (`SHOW_DEV_EMAILS`, never in production). Picking a provider
   is a deployment task.
4. **Two migration sets in one database.** The curriculum package owns curriculum and content tables
   (default Drizzle table); the app owns auth and learner tables (`__drizzle_migrations_web`). Learner rows
   point at content by stable string ids with no foreign keys, so content can be re-ingested or removed
   without touching progress.
5. **Lessons are MDX evaluated on the server at request time** (cached per content hash). This is safe only
   because lessons are trusted files reviewed in this repository; nothing user-written is ever evaluated.
   Question stems use react-markdown with no raw HTML.
6. **Readiness and review are simple, explainable models.** Readiness: per-domain Beta(1, 2) prior on
   answers with a 30-day half-life, weighted by the official domain weights, with a 90% band; shown only
   after 20 answers across 3 domains; 80% means book-ready. Review: Leitner boxes at 1, 2, 4, 8 and 16 days.
7. **Cert validity is assumed to be 24 months for every cert** until each is checked against the Linux
   Foundation's policy pages (they were not reachable from the build sandbox). "Expiring" means within 90
   days of the end.
8. **Sample content is flagged, not branched.** Mock items set `mock: true`, sit under `sample/` folders, are
   labelled in the UI, and leave in one ingest run with `CONTENT_INCLUDE_SAMPLE=false`.

## Consequences

- No hosted infrastructure is needed to develop or test: CI runs unit tests and Playwright end-to-end tests
  with axe accessibility checks against a Postgres service container.
- Before production: choose a mail provider, verify validity periods per cert, and replace the sample set
  with real content written under [ADR 0008](0008-content-from-public-sources-only.md).
- If lessons ever accept contributions from outside the repository, the runtime MDX evaluation must be
  replaced with compile-time builds or a sandbox.

## Update, 2026-11-26: deferred items done

- **Email (point 3):** `sendEmail` delivers over SMTP when `SMTP_URL` is set (nodemailer) and still writes
  every message to `outbox_email` as an audit trail; a failed send is logged and does not fail sign-up. The
  local Docker stack runs [Mailpit](https://mailpit.axllent.org) as a test inbox (http://localhost:4025), so
  nothing reaches real addresses. Choosing a hosted provider is still a deployment task: it only needs a new
  `SMTP_URL` and `MAIL_FROM`.
- **Validity (point 7):** every one of the 17 certs now has an explicit period in `src/lib/validity.ts`, all
  24 months, from section 3.2 of the Linux Foundation Global Certification and Confidentiality Agreement,
  which lists each cert and gives none a different period (checked 2026-11-26). A unit test fails when a cert
  in `content/curriculum/certs` has no entry.
- **Syntax highlighting:** fenced code with a language is highlighted on the server with rehype-highlight
  (highlight.js grammars for bash, shell, YAML, JSON, Dockerfile, Go, Python and INI only), so no highlighter
  ships to the browser. Untagged and `text` blocks stay plain. Code blocks get a Copy button.
