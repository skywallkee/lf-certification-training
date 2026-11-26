# 0016. Readiness counts labs, mock exams and lessons; review sessions mix certs

Date: 2026-11-26
Status: Accepted

(Numbered 0016 because two other changes were in flight at the same time and may take 0014 and 0015.)

## Context

Phase 1 (ADR 0009) computed readiness from question answers only, and kept a Leitner review queue of missed
questions. Since then labs (ADR 0010) and practical mock exams (ADR 0011) produce graded, per-task results, but
readiness ignored them. For the hands-on certs (CKA, CKAD, CKS, CKNE, LFCS) that is the most exam-like evidence a
learner has. There was also no single place to see progress across the certs a learner is working on, and the
review page showed only a count.

## Decision

- **One readiness model, more evidence.** The Beta posterior per domain stays (prior Beta(1, 2), 30-day half-life,
  90% band). Each piece of evidence has a weight and earns evidence points toward showing a score:

  | Source | Weight | Points | Notes |
  |--------|--------|--------|-------|
  | Question answer | 1 | 1 | as before |
  | Lab task (lab, or a mock exam in practice mode) | 2 | 2 | right when every check of the task passed in the final grading |
  | Mock exam task in exam mode | 3 | 3 | timed, no feedback: closest to the real exam |
  | Finished lesson | 0.25 | 0 | always "right"; capped at one right answer per domain |

  A task goes to the domain of its own competency (mock exams), else of the lab's first competency in the cert.
  A score still needs 20 points across 3 domains. Lessons only nudge mastery, never fail it, and cannot carry a
  domain on their own.
- **Progress dashboard** (`/progress`): for each cert in progress (focus, booked or studying) readiness with its
  8-week trend, what it is built from (questions, lessons, labs solved, best and latest mock exam score), the
  review queue for the cert, and a "Before you book" checklist: readiness at 80% or more, every domain at 50% or
  more (a weak light domain can hide behind strong heavy ones), and, where the cert has a mock exam, a pass in
  exam mode within 30 days.
- **Spaced review** keeps the Leitner boxes (1, 2, 4, 8, 16 days). Sessions take the 20 most overdue, least
  learned questions and interleave certs; a session can also be started for one cert. The review page lists
  the whole queue with each question's step, due date and misses, marks questions missed 3 or more times as
  hard and links their lesson, and counts questions learned (once missed, since cleared) from the answers.
- No schema change: everything is derived from existing tables.

## Consequences

- Readiness numbers move for learners with lab or mock history; the readiness pages say what the score is from
  ("70 answers, 3 lab tasks and 16 mock exam tasks").
- The weights are judgement calls, kept in `lib/readiness.ts` (`SOURCE_WEIGHT`, `SOURCE_POINTS`, `LESSON_CAP`)
  so they can be tuned once real learners and real content exist.
- Readiness for a cert now reads lab sessions and lessons on every request. Fine at local scale; cache per
  learner if it shows up in profiles.
