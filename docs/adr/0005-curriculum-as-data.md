# 5. The curriculum is data, verified against cncf/curriculum

Date: 2026-11-24 · Status: Accepted

## Context

The Golden Kubestronaut bundle changes over time (CKNE becomes required on 15 Feb 2027) and exam
curricula are revised. Readiness scores need the official domain weights. Most curricula are published as
PDFs in [cncf/curriculum](https://github.com/cncf/curriculum); their two-column layout cannot be parsed
reliably, three of them (CAPA, CCA, CGOA) have no text layer at all, and the READMEs in that repository
disagree with the PDFs for those three (they list equal weights).

## Decision

- One YAML file per certification in `content/curriculum/certs/`, validated by a zod schema
  (`@lfct/curriculum`) with a generated JSON Schema for editors. Bundle membership, including dates such as
  `requiredFrom`, lives in `content/curriculum/programs.yaml`.
- The PDF is the authority. Each file pins its source: repository commit, path and git blob SHA.
- Each file records how it was checked (`verification`):
  - `text`: CI fetches the pinned PDF, checks the blob SHA, extracts its text and confirms that every
    domain (with its weight) and every competency statement appears in it. 13 certs.
  - `visual`: the PDF has no text layer; transcribed from the rendered page and reviewed by a person. CI
    checks the blob SHA only. CAPA, CCA, CGOA.
  - `pending`: the source could not be read yet. LFCS is published on the Linux Foundation site, not in
    cncf/curriculum, and that site was not reachable when this was written: its domains and weights are
    from memory and must be checked; competencies are still to be added.
- Statements are kept verbatim, typos included ("Servicing and Networking", "API depreciations"), so the
  text check stays exact.
- Competency ids (`<cert>/<domain>/<competency>`) are stable once published; lessons, questions and labs
  reference them in a `competencies:` list.
- A monthly workflow compares the pinned blobs with the tip of cncf/curriculum and opens an issue on
  change, so revisions are noticed and re-transcribed.
- An ingest step loads the YAML into Postgres idempotently. A changed curriculum becomes a new
  `curriculum_version` row marked current; old versions stay for history.

## Consequences

- Updating a curriculum is a reviewed pull request, not a silent scrape.
- When cncf/curriculum renames a PDF for a new Kubernetes minor (e.g. `v1.38`), the drift issue lists it as
  missing and untracked; the fix is a new transcription with the new path, commit and blob SHA.
