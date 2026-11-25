# 10. Phase 2 labs run on local Docker first

Date: 2026-11-25 · Status: Accepted

## Context

Phase 2 adds hands-on labs: a catalogue, a lab player with a task panel, a terminal, a timer, per-check
grading, hints, a monthly allowance, history with reference solutions, an admin kill switch, and a sweeper
that deletes anything left behind. [ADR 0004](0004-on-demand-labs-two-clouds.md) puts labs on disposable
cloud VMs. The cloud infrastructure is not wanted yet: the platform must first run entirely on one machine
so every feature can be tried without spending credit.

## Decision

1. **`docker compose up` runs the whole platform**: Postgres, a one-shot setup job (migrations, content
   ingest, sample learners), the web app, and the lab controller. Nothing else is needed.
2. **The lab controller is a separate Node service** (`platform/apps/lab-controller`). The web app calls its
   internal API with a shared secret; the browser's terminal WebSocket goes straight to the controller with
   a two-minute HMAC token that the web app signs. Postgres is the only shared state.
3. **One lab session is three containers on a private network**: k3s (`rancher/k3s`, privileged), a grader
   and a workstation (both the `lfct-lab-tools` image). The workstation runs ttyd and tmux as an
   unprivileged `candidate` user with a kubeconfig; the controller relays its terminal. Only the controller
   joins the workstation's network; the cluster API is never published. Images are loaded from the host's
   Docker cache into k3s, so boots take seconds and work offline once pulled.
4. **Providers are pluggable.** `LAB_PROVIDER=docker` is the local implementation; `fake` runs the full flow
   without containers for end-to-end tests. Cloud providers (VMs per ADR 0004) come later behind the same
   interface (`provision`, `exec`, `openTerminal`, `destroy`, `listSessions`).
5. **Grading uses Kyverno Chainsaw asserts and shell checks.** A task's score is its weight times the share
   of its checks that pass. Lab files are validated at ingest; `selftest` proves each lab fails before it is
   solved and passes with its reference solution, in CI too.
6. **Exam-like player.** A lab may boot up to three clusters, each a kubectl context; every task names its
   cluster, its checks run against that cluster only, and the learner switches context per task. The player
   shows one exercise at a time with flags and Previous/Next, and a Documentation tab with the official docs.
   Docs sites may forbid framing, so the controller serves an allowlist of them (`LAB_DOCS_HOSTS`) at
   `<site>.localhost`, without the framing headers and with a CSP that lets only the web app frame them.
7. **Defaults from the design spec**: 600 lab minutes per learner per month (counted from ready to end), one
   active lab per learner, a capacity cap per machine (3), one 15-minute extension, up to 3 hints per task,
   a sweeper every 30 seconds that grades and ends expired labs, fails boots over 10 minutes, and deletes
   orphaned containers by label.

## Consequences

- Every feature can be built and tested on a laptop with no cloud account. CI runs the fake-provider
  end-to-end tests and a real k3s-in-Docker self-test.
- Labs need privileged containers on the learner's own Docker. That is acceptable for a local tool and is
  not how the hosted service will isolate learners: hosting needs the VM providers of ADR 0004.
- Tier 1 only: one k3s node per session. Multi-node and kubeadm labs (Phase 3) need VMs.
- ADR 0004 still holds for hosting; this record adds a local provider in front of it rather than replacing
  it.
