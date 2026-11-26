# 0011. The practical mock exam is a long lab session with a mode

Date: 2026-11-25
Status: Accepted

## Context

The practical mock exam design (Phase 4) imagines its own tables (`mock_exam`, `exam_attempt`, `attempt_task`,
`attempt_event`) and cloud VM profiles. The user asked to build it now, on local Docker only, on top of the
Phase 2 labs (up to three k3s clusters per session, terminal relay, Chainsaw grading, docs pane).

## Decision

- A mock exam is content in the lab format under `content/mocks/`, with a pass mark, a competency per task and
  no hints. It is ingested into the `lab` table with `kind = 'mock'`, so the controller, provider, grader and
  self-test need no second code path.
- An attempt is a `lab_session` row with `mode` `exam` or `practice`, plus `started_at` and `window_leaves`.
  The clusters boot first (prepare screen); the clock starts at Start (`started_at`, `expires_at`). A ready
  attempt not started within 15 minutes is removed and does not count.
- The controller enforces the rules: no checks in exam mode, one task per check in practice mode, terminal
  closed before final grading, attempts never started are not graded. The relay and terminal token refuse a
  terminal before Start.
- Allowance: attempts per learner, per cert, per calendar month, per mode (default 2 and 2, `MOCK_*` env), counted
  from Start. Mocks do not use lab minutes. One active lab or mock per learner, as before.
- Window leaves (page hidden) are counted with `sendBeacon` and shown only in the results.

## Consequences

- Everything runs with `docker compose up --build`; the cloud profiles from the design come later behind the
  same `LabProvider`.
- Flags and notes stay in the browser (localStorage), not in `attempt_task`; per-task results live in the final
  `lab_check_run`. If attempts need an audit trail or cross-device flags, add the design's tables then.
- Mock results do not feed readiness yet.
