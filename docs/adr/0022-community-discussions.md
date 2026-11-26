# 0022. Community discussions under lessons, questions, labs and mock exam tasks

Date: 2026-11-26
Status: Accepted

(Numbered 0022 because 0023 goes to the lesson format change made at the same time.)

## Context

Learners asked to help each other: ask why an answer is right, share a trick for a lab, compare notes on a mock
exam task. The app had private notes and "Flag a problem" reports, but nothing learners could read together.
Two things make discussion risky on an exam-prep site: solutions spoil questions and mocks for people who have
not tried them yet, and a running exam could be answered from the community.

## Decision

- **Targets.** A discussion belongs to a lesson, a question, a lab or a practical mock exam task (target type and
  content id, `<mock id>/<task id>` for a task), with no foreign key to content, like notes. Lessons and labs show
  their discussion inline; questions and mock tasks link to it ("Discussion (n)") from quiz feedback, quiz and mock
  results, and every discussion has its own page at `/discuss/<type>/<id>`, which emails link to.
- **Shape.** Threads with one level of replies (`discussion_post`), Markdown without raw HTML or images, one
  upvote per learner per post (`discussion_vote`, not on your own post), and one accepted reply per thread, chosen
  by the thread's author or an admin. Threads sort by votes then newest; replies show the accepted one first,
  then oldest first. Authors edit and delete their posts; a deleted thread with replies stays as a placeholder.
- **Spoilers.** An author marks a post as a spoiler and it stays folded until a reader opens it. Question and mock
  task discussions start folded as a whole for a learner who has not answered the question or finished an attempt
  of the mock ("show anyway" opens them). A mock task's text is not shown on its discussion page until the
  learner has taken the mock. These folds are courtesy, not security.
- **Exam lock (security).** While a learner has an exam-mode attempt running (a practical mock in exam mode that
  is requested, booting or ready, or an unfinished multiple-choice mock), the server sends no discussion content
  at all, on any target, and refuses posts, votes and accepts. Practice-mode mocks and labs are not locked.
- **Moderation.** Learners report a post with a reason (`discussion_report`, once per learner). Reports from 3
  learners hide the post until an admin decides. `/admin/discussions` lists reported posts (hidden first) and the
  newest posts; an admin hides, restores, marks as spoiler or deletes a post, or dismisses its reports, which
  resolves them. Admins can do the same inline. Disabled (banned) users cannot sign in, so cannot post.
- **Notifications.** Posting follows a discussion (`discussion_follow`); learners can follow or unfollow by hand.
  Followers get an email for a new thread or reply, at most one per discussion an hour (a key in
  `reminder_sent`), and a reply's author gets one when it is accepted. Emails never include a spoiler's text.
  Discussion emails are on by default and opt-out: a checkbox under Account (`profile.notify_discussions`) and a
  signed unsubscribe link (`k=discussions`) with one-click List-Unsubscribe, which only turns discussion emails
  off. Reminder links keep their old signature.
- **Limits.** 10 posts per learner per 10 minutes (the in-memory limiter), 5,000 characters a post. Only signed-in
  learners read discussions, so names are never public.

## Consequences

- One migration (web 0007) adds four tables and one profile column; deleting an account deletes the learner's
  posts, votes and follows (replies under a deleted thread go with it), and keeps their reports anonymously.
- Sample discussions are seeded with the sample learners, including one reported post, so the feature and the
  moderation queue can be tried locally at once.
- Counts are computed per page with a grouped query; at the expected size (thousands of posts) no counters are
  stored. A shared rate limiter is needed if the web app ever runs as several replicas (as for auth).
