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
| `labs/` | Lab definitions with tasks, Chainsaw or shell checks, hints and reference solutions |
| `mocks/` | Mock exams: practical ones in the lab format, multiple-choice ones with `format: multiple-choice` |

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

## Labs

One YAML file per lab under `labs/`. A lab boots a fresh single-node cluster, runs `setup`, and gives the
learner a terminal and the tasks. Checks grade the cluster when the learner asks and once more at the end.

```yaml
id: storage-claim                  # unique, lowercase
title: "Claim a volume"
summary: "Shown in the catalogue."
tier: 1                            # 1 = one k3s node (the only tier so far)
minutes: 20                        # time limit; one 15-minute extension is allowed
clusters: [c1, c2]                 # optional, 1 to 3 (default: one cluster); each is a kubectl context
competencies: [cka/storage/implement-storage-classes-dynamic-volume]
docs: [{ title: "Kubernetes docs: Persistent Volumes", url: https://kubernetes.io/docs/concepts/storage/persistent-volumes/ }]
images: [nginx:1.29-alpine]        # loaded into the cluster before the learner starts
setup: |                           # shell, run in the grader with cluster-admin before the terminal opens;
                                   # use kubectl --context <cluster> to reach each cluster
  kubectl create namespace web
solution: |                        # shell, run as the learner on the workstation; shown after the lab ends
  kubectl -n web apply -f - <<'YAML'
  ...
  YAML
tasks:
  - id: claim
    title: Create the claim
    cluster: c1                    # required with more than one cluster; its checks run against this cluster
    weight: 100                    # task weights add up to 100
    body: Markdown shown in the task panel.
    hints: ["Up to three, revealed one at a time and recorded."]
    checks:
      - id: pvc-bound
        description: PVC data in web is Bound      # shown when it passes
        failMessage: PVC data is missing or not Bound yet.   # optional, shown when it fails
        assert:                                    # a Chainsaw assert: a partial object to match
          apiVersion: v1
          kind: PersistentVolumeClaim
          metadata: { name: data, namespace: web }
          status: { phase: Bound }
      - id: answer
        description: The answer file names the class
        runIn: workstation                         # grader (default) or workstation; asserts run in the grader
        script: grep -qx local-path /opt/answers/class.txt   # passes on exit code 0
```

With more than one cluster, the learner switches context per task (`kubectl config use-context c2`), as in
the exams; the player shows the command above each task, and the reference solution must switch too (see
the three-cluster CKA sample lab). Setup runs on a cluster that has only just started: a new namespace has no `default` service account for a
moment, so wait for it before creating bare pods (see the CKNE sample lab). Each check has exactly one of
`assert` or `script`. Asserts can use Chainsaw's JMESPath forms, such as
`(length(spec.containers)): 1`. Before opening a pull request, prove the lab with a real cluster:
`pnpm --filter @lfct/lab-controller selftest <lab-id>` (some checks must fail before the solution, and all
must pass after it).

## Mock exams

Each cert gets a mock in the format of its real exam: a practical (hands-on) mock for the performance-based certs
(CKA, CKAD, CKS, CKNE, LFCS) and a multiple-choice mock for the others (KCNA, KCSA, CGOA and the like).

### Practical mock exams

Practical (hands-on) mock exams live under `mocks/`, one YAML file per mock, in the lab format above with
three differences, checked by `pnpm curriculum:validate`:

```yaml
id: cka-mock-1
minutes: 120                       # 120 for a full mock, 60 for a half mock (at least 30)
passPercent: 66                    # required: the cert's pass mark
clusters: [c1, c2, c3]
tasks:                             # at least 4; 15 to 20 for a full mock
  - id: rbac
    cluster: c1
    weight: 7
    competency: cka/cluster-architecture-installation-configuration/manage-role-based-access-control  # required: decides the score per domain
    doc: { title: "Using RBAC Authorization", url: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/" }  # optional: linked when the task is missed
    body: ...
    checks: [...]                  # as in labs; no hints in a mock exam
```

Task statements stay hidden until the learner presses Start. In exam mode nothing is graded until Submit or
time up (the terminal freezes first); practice mode adds a Check button per task. Prove a mock exactly like a
lab: `pnpm --filter @lfct/lab-controller selftest <mock-id>`.

Match the real exam's layout: its duration, its pass mark (66% for CKA and CKAD, 67% for CKS) and task weights
that add up per domain to the curriculum's domain weights (a unit test checks this for the CKAD and CKS samples).

### Multiple-choice mock exams

A multiple-choice mock is a short YAML file under `mocks/` that starts with `format: multiple-choice`. It asks
questions from the cert's question bank (`questions/`), so it has no questions of its own:

```yaml
format: multiple-choice            # required: marks the file as a multiple-choice mock
id: kcna-mock-1
title: KCNA mock exam
summary: Sixty questions in ninety minutes, like the real exam.
cert: KCNA                         # a multiple-choice cert
minutes: 90                        # the exam timer
questionCount: 60                  # questions per attempt
passPercent: 75                    # the cert's pass mark
questions: [kcna-001, kcna-002]    # optional: a fixed list, asked in a new order each time
mock: false
```

Without `questions`, each attempt draws `questionCount` published questions of the cert, split over the domains by
their exam weight and preferring questions the learner has not answered yet. If the bank holds fewer, the attempt
asks what there is and scales the timer to the same pace. There is no feedback until the learner submits (or time
runs out); then each answered question is recorded like a quiz answer, so it counts toward readiness and missed
questions join the review queue. Multiple-choice mocks need no lab, so they have no monthly limit.

## Editing content in the app

Admins can also create and edit lessons, questions, labs and both kinds of mock exam in the app, under **Admin > Content**,
without touching this folder. The editor has a form view and a source view that shows the item in exactly the
file format described above, and it validates with the same schemas as the ingest.

- New items start as **drafts**: learners do not see them in lists, search, quizzes or the lab catalogue until
  an admin publishes them. Admins can open a draft lab or mock exam by its link to try it.
- An item created or edited in the app is stored in the database with `origin = app`. The ingest never
  overwrites or deletes those rows, so the app version wins over a file with the same id. **Revert to file
  version** on an edited item undoes the app edits and hands it back to the ingest.
- Every save is recorded in a history with the item as it was; any earlier version can be restored.
- **Download file** exports the item in its file format and names the path to commit it at, so content
  written in the app can move into this repository.
- Lesson MDX written in the app is held to a safe subset before it is saved or rendered: Markdown plus
  `<Callout>` and `<Flow>` with plain values as props (no imports, `{expressions}` or other tags).
- Items that learners have already used cannot be deleted, only unpublished; ingested items cannot be deleted
  in the app (remove the file instead).

## The sample set

The app ships with **mock content only**: 12 lessons, 74 questions, 4 labs, 4 practical mock exams (CKA full and
half, CKAD, CKS) and 3 multiple-choice mock exams (KCNA full and quick, KCSA) across KCNA, KCSA, CKA, CKAD, CKS and
CKNE, written to
exercise the app (a long lesson, two very short ones, a lesson tagged for two certs, competencies with no
lesson, and one deliberately broken question). It is not study material. Every sample file sits under a
`sample/` folder and sets `mock: true`; the app labels it "Sample content".

To remove it:

- **From a database**, in one step: ingest with the sample set left out. Rows that are no longer in the
  content are deleted, and the run is recorded on the admin page.

  ```sh
  CONTENT_INCLUDE_SAMPLE=false DATABASE_URL=... pnpm curriculum:ingest
  ```

- **From the repository**, when real content replaces it: delete `content/lessons/sample/`,
  `content/questions/sample/`, `content/labs/sample/` and `content/mocks/sample/`.

Learner progress points at content by id, so removing items leaves no broken rows: progress on items that no
longer exist is simply not shown.

## Curriculum status

| Verification | Certs | Meaning |
|--------------|-------|---------|
| `text` | CKA, CKAD, CKS, KCNA, KCSA, PCA, ICA, CBA, OTCA, KCA, CNPA, CNPE, CKNE | CI checks every domain, weight and statement against the PDF text |
| `visual` | CAPA, CCA, CGOA | PDF has no text layer; transcribed from the rendered page. The READMEs in cncf/curriculum list different (equal) weights; the PDFs win |
| `pending` | LFCS | Not in cncf/curriculum, and the Linux Foundation exam page was not reachable when this was written. Domains and weights are from memory and must be checked against that page; competencies still to transcribe |

Source: [cncf/curriculum@f5ab45e](https://github.com/cncf/curriculum/tree/f5ab45e0ed85cb38a23252a71eb05891e513da66) (2026-11-11), CC BY 4.0.
