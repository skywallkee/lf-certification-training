# 0018. Mock exams follow each exam's format: CKAD and CKS layouts, and multiple-choice mocks

Date: 2026-11-26
Status: Accepted

(Numbered 0018 because other changes in flight at the same time take 0017, 0019 and 0020.)

## Context

The practical mock exam (ADR 0011) shipped with two CKA samples. The user asked for more mock exam types: CKAD and
CKS layouts, and multiple-choice mocks for the knowledge certs (KCNA, KCSA, CGOA and the like), whose real exams
are timed multiple-choice tests rather than terminal tasks. Content is still mock content only.

## Decision

- **CKAD and CKS are content, not code.** They use the practical mock format as it is: 120 minutes, two clusters,
  pass marks 66% (CKAD) and 67% (CKS), and task weights that add up per domain to the curriculum's domain weights
  (checked by a unit test). Both pass the lab self-test on k3s.
- **Multiple-choice mocks are a new content type** under `content/mocks/` with `format: multiple-choice`: cert,
  minutes, question count, pass mark, and an optional fixed list of question ids. They have no questions of their
  own: they ask from the cert's question bank, so one bank serves practice, review and mocks. Only multiple-choice
  certs may have one. They are ingested into a new `quiz_mock` table (curriculum migration 0006), share the id
  space of labs and practical mocks, and are editable in the admin content editor as their own type
  (`quiz-mock`), with drafts, history, restore and file export like the other types.
- **Questions are drawn per attempt by domain weight** (largest remainder), capped at what each domain holds, with
  seats a short domain cannot fill passed to the others, and unseen questions first. When the bank is smaller than
  the mock, the attempt asks what there is and scales the timer to the same pace (90 minutes for 60 questions).
- **An attempt is a `quiz` row with kind `mock`** (web migration 0005 adds the enum value and `mock_id`,
  `expires_at`, `draft`, `score`, `pass_percent`). Answers and flags autosave to `draft` while the clock runs; there
  is no feedback until Submit or time up. Grading writes one `answer` row per answered question, so readiness, the
  review queue, recent activity and the progress dashboard's mock exam checks use them with no new code path.
  Unanswered questions count as wrong in the score but are not recorded as answers. An attempt whose time ran out
  with the tab closed is graded the next time the learner opens it, the mocks page or the history.
- **No monthly allowance** for multiple-choice mocks: they need no lab. One running attempt per mock; starting
  again resumes it.

## Consequences

- Readiness counts a multiple-choice mock answer like any question answer (weight 1). If exam-condition answers
  should weigh more, add a source to `lib/readiness.ts`.
- The sample KCNA bank holds 24 questions and the sample KCSA bank 14, so the "full" sample mocks ask fewer
  than 60 questions until real content exists.
- Practical mocks are still CKA, CKAD and CKS only; CKNE and LFCS can get one the same way when wanted.
