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
| `lessons/` | MDX lessons, one folder per cert (Phase 1) |
| `questions/` | Multiple-choice question banks in YAML (Phase 1) |
| `labs/` | Lab definitions with Chainsaw checks and reference solutions (Phase 2) |

## Curriculum status

| Verification | Certs | Meaning |
|--------------|-------|---------|
| `text` | CKA, CKAD, CKS, KCNA, KCSA, PCA, ICA, CBA, OTCA, KCA, CNPA, CNPE, CKNE | CI checks every domain, weight and statement against the PDF text |
| `visual` | CAPA, CCA, CGOA | PDF has no text layer; transcribed from the rendered page. The READMEs in cncf/curriculum list different (equal) weights; the PDFs win |
| `pending` | LFCS | Not in cncf/curriculum, and the Linux Foundation exam page was not reachable when this was written. Domains and weights are from memory and must be checked against that page; competencies still to transcribe |

Source: [cncf/curriculum@f5ab45e](https://github.com/cncf/curriculum/tree/f5ab45e0ed85cb38a23252a71eb05891e513da66) (2026-11-11), CC BY 4.0.
