# Product defaults

Reviewed and confirmed on 2026-11-26: every default below stays as it is. Before this review they were
recommendations applied without a decision. To change one, update this file together with the code or setting
named next to it.

## A. Product choices

| # | Default | Where |
|---|---------|-------|
| A1 | Curriculum and lessons are public; quizzes, labs and mocks need an account | web app routes |
| A2 | Sign-in with verified email, plus GitHub | Better Auth config |
| A3 | Open sign-up for studying; labs limited by a monthly quota | web app, see C1 |
| A4 | Motivation is a streak and a readiness score; no leaderboards | Today, Progress |
| A5 | First content: KCNA, CKA and CKNE theory (sample set for now) | `content/` |
| A6 | Theme follows the system setting, with a toggle on every screen | `components/theme-toggle.tsx` |
| A7 | English only; copy kept in message files for later translation | web app |

## B. Hands-on mock exams (ADR 0011)

| # | Default | Where |
|---|---------|-------|
| B1 | Exam mode, plus practice mode with a Check button per task | mock player |
| B2 | Full 120-minute mock and 60-minute half mock | `content/mocks/` |
| B3 | 2 exam and 2 practice attempts per cert per month, counted at Start | `MOCK_EXAMS_PER_MONTH`, `MOCK_PRACTICE_PER_MONTH` |
| B4 | Start now on a prepare screen; timer starts when clusters are healthy; 15 minutes to begin | mock prepare screen |
| B5 | Leaving the window is logged and shown only in results | mock results |

## C. Labs (ADR 0010)

| # | Default | Where |
|---|---------|-------|
| C1 | 600 lab minutes per learner per month, 1 active lab per learner, 3 per machine (self-hosted: also 6 clusters in all); when full, a first-come, first-served waiting line | `LAB_MONTHLY_MINUTES`, `LAB_MAX_ACTIVE_SESSIONS`, `LAB_MAX_CLUSTERS` |
| C2 | One 15-minute extension, up to 3 hints, 10-minute boot timeout | `LAB_BOOT_TIMEOUT_SECONDS`, lab player |

## D. Readiness (ADR 0016)

| # | Default | Where |
|---|---------|-------|
| D1 | Evidence weights: question 1, lab task 2, exam-mode mock task 3, lesson 0.25 capped at 1 per domain | `lib/readiness.ts` `SOURCE_WEIGHT`, `LESSON_CAP` |
| D2 | Ready at 80% | `READY_AT` |
| D3 | A score shows after 20 evidence points in at least 3 domains | `MIN_ANSWERS`, `MIN_DOMAINS` |
| D4 | Evidence half-life of 30 days | `HALF_LIFE_DAYS` |
| D5 | "Before you book": readiness 80%, every domain at 50%, an exam-mode mock passed in the last 30 days | `lib/booking.ts` `DOMAIN_FLOOR`, `MOCK_FRESH_DAYS` |
| D6 | A review question is "hard" after 3 misses | `lib/review.ts` `HARD_AFTER_LAPSES` |

## E. Admin content editor (ADR 0013)

| # | Default | Where |
|---|---------|-------|
| E1 | New items start as drafts | content editor |
| E2 | New items are marked sample content (`mock: true`); switch off once real lessons are written | content editor |
| E3 | An app edit wins over the content file until Revert | ingest, ADR 0013 |
| E4 | Every change keeps history; any version can be restored | `content_revision` |
| E5 | Grading checks are edited as plain text | content editor |
| E6 | A single admin publishes directly, no review step | content editor |

## F. Discussions (ADR 0022)

Chosen when discussions were added on 2026-11-26 and not yet reviewed. Constants are in `platform/apps/web/src/lib/discussions.ts`.

| # | Default | Where |
|---|---------|-------|
| F1 | Only signed-in learners read and write discussions, so names are never public | `components/discussions/discussion.tsx` |
| F2 | Threads with one level of replies; one accepted reply per thread, picked by the thread's author or an admin | `lib/discussions.ts` |
| F3 | Question and mock task discussions start folded until the learner has answered or taken the mock | `startsFolded` |
| F4 | All discussions are hidden while an exam-mode mock runs; practice mode is not locked | `pickActiveExam` |
| F5 | Reports from 3 learners hide a post until an admin decides | `AUTO_HIDE_REPORTS` |
| F6 | Discussion emails on by default (opt-out), at most one per discussion an hour per learner | `EMAIL_THROTTLE_MS`, Account |
| F7 | 10 posts per learner per 10 minutes, 5,000 characters a post | `POST_LIMIT`, `BODY_MAX` |
