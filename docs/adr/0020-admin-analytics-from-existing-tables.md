# 0020. Admin analytics are computed from existing tables, with a seeded sample cohort

Date: 2026-11-26
Status: Accepted

(Numbered 0020 because several other changes were in flight at the same time and may take 0014 to 0019.)

## Context

Admins had no view of how the platform is used: how many learners are active, where learners struggle, and how
much lab time is spent. Lab time matters most, because once labs move to cloud VMs (ADR 0004) cluster time is what
the monthly credits pay for. A local install has three or four real accounts, so any analytics page would be empty
without sample data.

## Decision

- **`/admin/analytics`**, admin only, over a window of 4, 12 (default) or 26 weeks. Weeks start on Monday, in UTC.
  Accounts with the admin role are left out of every number.
- **No event log and no migration.** Everything is derived from the tables the app already writes:
  - *Active learner*: answered a question, finished a lesson, or started a lab or mock exam that day. The page shows
    active learners per week, active in the last 7 days (with the change on the 7 days before) and the last 30.
  - *Weak domains*: share right per cert domain across learners, counting answers and graded lab or mock tasks
    (a task is right when all its checks passed, placed in a domain as in ADR 0016). Domains with fewer than 20
    pieces of evidence are left out. *Most missed questions* needs 5 answers per question.
  - *Labs and mock exams*: starts, learners, completed (graded at the end, by the learner or at the time limit),
    failed to boot, average score or pass rate, and **cluster minutes**: minutes from ready to end (capped at expiry)
    times the lab's number of clusters. Mock exams count from the prepare screen, since their clusters already run.
- The aggregation is pure code in `lib/analytics.ts` (unit tested); `server/analytics.ts` runs a few indexed range
  scans. That is fine for hundreds of learners; a daily rollup table can replace the scans later without changing
  the page.
- **Sample cohort**: `scripts/seed-cohort.ts` adds 30 learners at `@cohort.example.com` (no password) with six
  months of activity at three paces, growing sign-ups, some drop-off, deliberately weak domains (CKA Storage and
  Troubleshooting, KCNA Container orchestration), two questions most learners miss, and a few failed or killed labs.
  It is deterministic for a given day, reseeded with the sample learners, and added on its own to databases seeded
  before it existed.

## Consequences

- Analytics cost nothing to collect and stay consistent with what learners see on their own pages.
- Things the tables do not record cannot be shown: page views, time spent reading lessons, or why a learner stopped.
  Adding them would need an event table, which this decision leaves for later.
- The sample cohort shows up in the admin user list and in the numbers; on a real deployment it is never seeded
  (the seed refuses to run with NODE_ENV=production).
