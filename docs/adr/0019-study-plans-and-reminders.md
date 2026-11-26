# 0019. Weekly study plans from the exam date, and opt-in reminder emails

Date: 2026-11-26
Status: Accepted

(Numbered 0019 because 0017, 0018 and 0020 went to changes in flight at the same time.)

## Context

Learners could record a booked exam date and see readiness per cert (ADR 0016), but nothing turned the two into
"what do I do this week", and nothing brought a learner back after a few quiet days. Many learners pick a date
before booking, so a plan has to work from a target date too.

## Decision

- **Exam date per cert.** A booked exam (`cert_status`, as before) or, when not booked, a target date in a new
  `study_target` table. The plan counts down to the booked date when there is one. Booking from the Path page
  or the Plan page removes the target; unticking "I have booked it" turns a booking back into a target.
- **The plan is computed, never stored** (`lib/study-plan.ts`), from readiness per domain, the official domain
  weights and the learner's weekly hours (onboarding, editable under Account):
  - hours needed = a full course for the exam style (40 h hands-on, 20 h multiple-choice) times the weighted gap
    to the 80% book-ready mark per domain, where a domain with no graded evidence counts as 0%;
  - hours available = weekly hours for every week to the exam, with this week and the exam week prorated by the
    days left in them; available over needed gives the pace: on track (1.1 or more), tight (0.8 or more), behind
    (with how many extra hours a week would fix it), or ready (no gap);
  - weeks: the exam week is review and light practice only; the week before it (when the plan has 3 or more
    weeks) is a timed mock exam, or a long practice quiz where the cert has no mock, plus weak spots; earlier
    weeks take the two domains with the biggest remaining need, plus one lab a week for hands-on certs that
    have labs. Every week keeps 15% (up to 90 minutes) for the review queue.
  - Study time per week is estimated from activity: 1.5 minutes a question, each lesson's length, and the real
    time spent in labs and mock exams.
- **Pages.** `/plan` (new sidebar item) shows each cert with a date (and the focus cert without one, with a
  form to set it), the pace, this week's tasks with links, and the weeks ahead. Today shows this week's top
  tasks for the soonest exam.
- **Reminder emails, all off by default** (profile columns): this week's plan on a chosen weekday, a nudge
  after 3 days without study (once per quiet spell), and an exam countdown 7 days and 1 day before. Each goes
  out at or after a chosen local hour, only to verified addresses. `lib/reminders.ts` decides what is due and
  gives each reminder a key; `server/reminders.ts` inserts the key into `reminder_sent` before sending, so a
  reminder goes out once even with overlapping runs or several app instances.
- **Scheduler.** `instrumentation.ts` starts a timer in the web server that calls `POST /api/reminders/run`
  every `REMINDERS_INTERVAL_MINUTES` (default 10, 0 turns it off), authorised with a token derived from the auth
  secret, or `REMINDERS_SECRET` when set. In the cloud an outside scheduler can call the same route instead.
- **Unsubscribe.** Every reminder has a signed link (HMAC of the user id under the auth secret) to a page with
  a "Stop all reminders" button (opening the link changes nothing, because mail scanners open links), plus
  `List-Unsubscribe` and `List-Unsubscribe-Post` headers for one-click unsubscribe in mail apps (RFC 8058).
  Account emails (verification, password reset) are not affected.

## Consequences

- Locally every reminder lands in Mailpit (http://localhost:8025). "Email me this week's plan" on the Plan page
  sends the weekly email at once, so it can be checked without waiting for the chosen day.
- Defaults chosen without product input, all constants in the two lib files: 40/20 base hours, the pace
  thresholds, 15% review share, 3-day nudge, countdown at 7 and 1 days, reminders at 08:00 on Mondays once
  turned on.
- Migration `0005_study_plans` adds `study_target`, `reminder_sent` and five profile columns.
- The scheduler runs inside the web process, so reminders stop while the web app is down and catch up on the
  same day when it is back (a weekly email is only sent on its chosen day).
