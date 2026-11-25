# Content

Everything a learner studies, as data. The web app reads it from Postgres after the ingest job loads it,
so content changes ship without an app release.

## Rules

1. **Public sources only.** Write from the public curriculum, official documentation and original
   scenarios. Never from recalled or shared exam questions: the exams are under NDA ([ADR 0008](../docs/adr/0008-content-from-public-sources-only.md)).
2. **Tag every item with competencies.** Lessons list them in front matter, question banks and lab
   definitions per question or task:

   ```yaml
   competencies:
     - cka/storage/implement-storage-classes-dynamic-volume
   ```

   `pnpm curriculum:validate` fails on a tag that matches no competency. The `coverage_gaps` MCP tool lists
   what is still missing.
3. **Curriculum files mirror their source.** `curriculum/certs/*.yaml` are transcriptions of the official
   curricula, verbatim, typos included. Change them only to follow the source, and update the pinned
   `commit` and `blobSha` when you do ([ADR 0005](../docs/adr/0005-curriculum-as-data.md)).

## Layout

| Path | Contents |
|------|----------|
| `curriculum/certs/<code>.yaml` | Domains, weights and competencies for one certification |
| `curriculum/programs.yaml` | Kubestronaut and Golden Kubestronaut membership, with dates |
| `curriculum/schema/` | Generated JSON Schemas (`pnpm curriculum:schema`); editors use them via the `yaml-language-server` comment |
| `lessons/` | MDX lessons with YAML front matter |
| `questions/` | Multiple-choice question banks in YAML |
| `lessons/sample/`, `questions/sample/` | The mock sample set (see below) |
| `labs/` | Lab definitions with Chainsaw checks and reference solutions (Phase 2) |

## Lessons

One MDX file per lesson. The front matter is checked by `pnpm curriculum:validate`:

```mdx
---
id: storage-classes                # unique, lowercase, used in URLs and progress records
title: "Storage classes and dynamic provisioning"
summary: "One or two sentences shown on the competency page and in search."
minutes: 12                        # reading time
competencies:                      # the first one decides which cert the lesson belongs to
  - cka/storage/implement-storage-classes-dynamic-volume
docs:                              # official documentation to read next (https only)
  - title: "Kubernetes docs: Storage Classes"
    url: https://kubernetes.io/docs/concepts/storage/storage-classes/
---

Markdown body. GitHub tables and fenced code blocks work.

<Callout kind="tip" title="On the exam">Short aside: kind is note, tip or warning.</Callout>

<Flow label="From claim to mounted volume" steps={["PVC created", "Provisioner makes a PV", "PV binds", "Pod mounts it"]} />
```

Lessons are trusted content written in this repository and reviewed in pull requests: the app evaluates the
MDX on the server ([ADR 0009](../docs/adr/0009-phase-1-study-app.md)). Only `Callout`, `Flow` and plain
Markdown are available. Keep imports and expressions out.

## Questions

A question bank is a YAML file with a list of questions. Each one has:

| Field | Notes |
|-------|-------|
| `id` | Unique across all banks, lowercase |
| `kind` | `single` (exactly one correct option) or `multiple` (two or more) |
| `competencies` | One or more competency ids; the first decides the cert |
| `stem` | Markdown: inline code and fenced code blocks are fine |
| `options` | 2 to 6 options with ids `a` to `f`; mark the right ones with `correct: true` |
| `explanation` | Why the answer is right, shown after answering |
| `source` | `{ title, url }` of the documentation page the question is based on (https) |
| `knownIssue` | Optional. Marks an item as known to be broken: it is never served in quizzes and opens an item in the admin flag queue |

## The sample set

Phase 1 ships with **mock content only**: 12 lessons and 60 questions across KCNA, CKA and CKNE, written to
exercise the app (a long lesson, two very short ones, a lesson tagged for two certs, competencies with no
lesson, and one deliberately broken question). It is not study material. Every sample file sits under a
`sample/` folder and sets `mock: true`; the app labels it "Sample content".

To remove it:

- **From a database**, in one step: ingest with the sample set left out. Rows that are no longer in the
  content are deleted, and the run is recorded on the admin page.

  ```sh
  CONTENT_INCLUDE_SAMPLE=false DATABASE_URL=... pnpm curriculum:ingest
  ```

- **From the repository**, when real content replaces it: delete `content/lessons/sample/` and
  `content/questions/sample/`.

Learner progress points at content by id, so removing items leaves no broken rows: progress on items that no
longer exist is simply not shown.

## Curriculum status

| Verification | Certs | Meaning |
|--------------|-------|---------|
| `text` | CKA, CKAD, CKS, KCNA, KCSA, PCA, ICA, CBA, OTCA, KCA, CNPA, CNPE, CKNE | CI checks every domain, weight and statement against the PDF text |
| `visual` | CAPA, CCA, CGOA | PDF has no text layer; transcribed from the rendered page. The READMEs in cncf/curriculum list different (equal) weights; the PDFs win |
| `pending` | LFCS | Not in cncf/curriculum, and the Linux Foundation exam page was not reachable when this was written. Domains and weights are from memory and must be checked against that page; competencies still to transcribe |

Source: [cncf/curriculum@f5ab45e](https://github.com/cncf/curriculum/tree/f5ab45e0ed85cb38a23252a71eb05891e513da66) (2026-11-11), CC BY 4.0.
