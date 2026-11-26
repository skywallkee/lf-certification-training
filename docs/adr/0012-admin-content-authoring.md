# 12. Admins author content in the app; the database copy wins over files

Date: 2026-11-26 · Status: Accepted

## Context

Lessons, questions, labs and mock exams are files under `content/`, loaded into Postgres by the ingest
(ADR 0005, 0009, 0010, 0011). Changing anything meant editing YAML or MDX, rebuilding and re-ingesting. The admin
wants to create and edit content inside the app. The lesson format may still change, so the editor must not
hard-code it, and the ingest runs on every `docker compose up`, so edits stored in the database must survive it.

## Decision

- **Same format, same validation.** The editor works on the JSON the content files hold and validates it with
  the zod schemas in `@lfct/curriculum` (`authoring.ts` wraps them, plus competency checks against the current
  curricula and the mock exam rules). Each item has a form view and a source view showing the item as its file
  (MDX with front matter, or YAML). Fields the form does not know are kept, so a format change needs a schema
  change, not an editor rewrite.
- **Origin column.** `lesson`, `question` and `lab` get `origin` (`file` | `app`) and `published`. The ingest
  upserts only rows whose origin is `file` and deletes only those, so an item created or edited in the app is
  never overwritten. The first app edit of an ingested item keeps its file version in the history, and **Revert
  to file version** restores it and sets origin back to `file`.
- **Drafts.** New items start unpublished. Learner lists, search, quizzes, the lab and mock catalogues and the
  catalog's lesson and question counts read published rows only; a draft lab or mock exam opens by link for
  admins only. Ingested items are always published (ingest does not touch the flag).
- **History.** Every save, publish, delete, restore and revert writes a `content_revision` row with the item
  after the change, in editor JSON, so any version can be restored.
- **Export.** Each item downloads as its file with the path to commit it at, so app-authored content can move
  into the repository and go through review like the rest.
- **Safe MDX.** Lesson MDX is evaluated on the server. MDX from the editor must parse to Markdown plus
  `<Callout>` and `<Flow>` with literal props (no ESM, no text expressions, no other JSX); it is checked on save
  and again before rendering, so a stolen admin session cannot run code on the server through a lesson.
- **Ids are fixed** once created (learner progress refers to them). Items learners have used cannot be deleted,
  only unpublished; ingested items cannot be deleted in the app.

Recommended defaults applied without a separate decision: drafts for new items, new items marked as sample
content (`mock: true`, the content format may still change), history with restore, and lab checks edited as
text (an assert tree or a script) inside the task form rather than with a dedicated form.

## Consequences

- Two sources of truth exist for an edited item until it is exported and committed, or reverted. The admin
  content list shows each item's source (file, edited in app, created in app) to keep that visible.
- Editing a lab during a running session can change what the next Check grades; acceptable for a single admin.
- No review workflow (author, reviewer) yet: one admin role publishes directly.
