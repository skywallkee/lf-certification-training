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
    comingLabs: "Labs arrive in February 2027",
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
} as const;

export type Messages = typeof en;
