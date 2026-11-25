/**
 * UI copy, English only in v1. Kept in one place so translation stays cheap later (open choice 9).
 * Voice: plain, calm and specific. Same words everywhere: cert for the credential, exam for the sitting,
 * readiness for the score.
 */
export const en = {
  appName: "LF Cert Trainer",
  sampleLabel: "Sample content",
  sampleExplainer: "This is mock content for building and testing the app, not study material.",
  nav: {
    main: "Main",
    today: "Today",
    path: "Path",
    certs: "Certs",
    review: "Review",
    practice: "Practice",
    search: "Search",
    bookmarks: "Saved",
    account: "Account",
    admin: "Admin",
    labs: "Labs",
    mocks: "Mocks",
    comingMocks: "Mock exams arrive in mid 2027",
    signIn: "Sign in",
    signOut: "Sign out",
    skip: "Skip to content",
  },
  home: {
    title: "Study for all 17 Golden Kubestronaut certs",
    lead: "One path map that shows where you stand, and one loop per cert: learn, practise, check. Free, no card, ever.",
    start: "Start studying",
    browse: "Browse the certs",
  },
  status: {
    "not-started": "Not started",
    studying: "Studying",
    booked: "Booked",
    passed: "Passed",
    expiring: "Expiring soon",
    expired: "Expired",
  },
  readiness: {
    little: (answers: number, domains: number) =>
      `Not enough answers yet to estimate readiness. Answer ${answers} more question${answers === 1 ? "" : "s"}${
        domains > 0 ? ` across at least ${domains} more domain${domains === 1 ? "" : "s"}` : ""
      }.`,
    bookReady: "Book-ready at 80%",
  },
  review: {
    empty: "Nothing to review today. Missed questions come back here on a schedule.",
  },
  quiz: {
    noQuestions: "No questions match this selection yet. Choose more domains, or another cert.",
    flag: "Flag a problem with this question",
  },
  coverage: {
    coming: "Lesson coming",
  },
  labs: {
    title: "Labs",
    lead: "Hands-on tasks on a fresh Kubernetes cluster, graded check by check. Each lab runs on its own cluster that is deleted when you finish.",
    booting: "Starting your cluster. Read the task while you wait.",
    quotaUsed: (month: string, reset: string, minutes: number) =>
      `You've used your ${minutes} lab minutes for ${month}. They reset on ${reset}. Questions and lessons are still open.`,
    capacity: "Every lab slot is in use right now. Try again in a few minutes; lessons and questions are still open.",
    controllerDown:
      "The lab controller is not running, so labs cannot start. Locally, start the whole stack with docker compose up.",
    activeSession: "You already have a lab running. Finish it before starting another.",
    finishTitle: "Finish this lab?",
    finishBody: "The lab's clusters will be deleted and the checks graded one last time.",
    finishConfirm: "Finish and delete cluster",
    keepWorking: "Keep working",
    check: "Check my work",
    checking: "Checking…",
    noChecksYet: "No checks run yet. Press Check my work whenever you want feedback; it does not end the lab.",
    checkSummary: (passed: number, total: number) => `${passed} of ${total} check${total === 1 ? "" : "s"} passed.`,
    extend: (minutes: number) => `Extend ${minutes} min`,
    extended: "Extended",
    failed: "This lab could not start.",
    ended: "This lab has ended.",
  },
} as const;

export type Messages = typeof en;
