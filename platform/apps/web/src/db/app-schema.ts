import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

/**
 * Learner data. Content (lessons, questions) lives in the curriculum package's tables and is referenced
 * here by its stable string id, without foreign keys, so re-ingesting content never cascades into
 * progress. Every learner row cascades on user delete, which is how "delete my account and data" works.
 */

const userRef = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const goal = pgEnum("study_goal", ["golden", "kubestronaut", "one"]);

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("UTC"),
  goal: goal("goal"),
  /** The single cert when goal is "one". */
  goalCert: text("goal_cert"),
  hoursPerWeek: integer("hours_per_week"),
  focusCert: text("focus_cert"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** Study reminder emails, all opt-in (lib/reminders.ts): this week's plan, a nudge after a quiet spell, exam countdown. */
  remindWeekly: boolean("remind_weekly").notNull().default(false),
  remindNudge: boolean("remind_nudge").notNull().default(false),
  remindExam: boolean("remind_exam").notNull().default(false),
  /** Weekday for the weekly plan email, 0 Sunday to 6 Saturday. */
  remindDay: integer("remind_day").notNull().default(1),
  /** Local hour from which reminder emails go out. */
  remindHour: integer("remind_hour").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const examState = pgEnum("exam_state", ["booked", "passed"]);

/** Self-reported exam status. Expiry is computed from passedOn and the cert's validity, not stored. */
export const certStatus = pgTable(
  "cert_status",
  {
    userId: userRef(),
    certCode: text("cert_code").notNull(),
    state: examState("state").notNull(),
    bookedFor: date("booked_for"),
    passedOn: date("passed_on"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certCode] })],
);

/**
 * A target exam date for a cert the learner has not booked yet. The study plan uses the booked date (cert_status)
 * when there is one, and this date otherwise. Booking the exam removes the target.
 */
export const studyTarget = pgTable(
  "study_target",
  {
    userId: userRef(),
    certCode: text("cert_code").notNull(),
    examOn: date("exam_on").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certCode] })],
);

/** Reminder emails already sent, by key (lib/reminders.ts), so none goes out twice. */
export const reminderSent = pgTable(
  "reminder_sent",
  {
    userId: userRef(),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: userRef(),
    lessonId: text("lesson_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const quizKind = pgEnum("quiz_kind", ["practice", "review"]);
export const feedbackMode = pgEnum("feedback_mode", ["instant", "end"]);

export const quiz = pgTable(
  "quiz",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: quizKind("kind").notNull(),
    feedback: feedbackMode("feedback").notNull().default("instant"),
    /** Null for a review quiz across certs. */
    certCode: text("cert_code"),
    domainKeys: text("domain_keys").array().notNull().default(sql`'{}'::text[]`),
    questionIds: text("question_ids").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("quiz_user_idx").on(t.userId, t.createdAt)],
);

/** Every answer a learner gives: the evidence behind mastery, readiness and the review schedule. */
export const answer = pgTable(
  "answer",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: userRef(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    certCode: text("cert_code").notNull(),
    selected: text("selected").array().notNull(),
    correct: boolean("correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("answer_user_cert_idx").on(t.userId, t.certCode, t.answeredAt),
    index("answer_quiz_idx").on(t.quizId),
  ],
);

/** Spaced review state: a missed question enters at box 0 and leaves after it is answered right at the last box. */
export const reviewItem = pgTable(
  "review_item",
  {
    userId: userRef(),
    questionId: text("question_id").notNull(),
    box: integer("box").notNull().default(0),
    dueOn: date("due_on").notNull(),
    lapses: integer("lapses").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] }), index("review_due_idx").on(t.userId, t.dueOn)],
);

export const targetType = pgEnum("target_type", ["lesson", "question"]);

export const note = pgTable(
  "note",
  {
    userId: userRef(),
    targetType: targetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const bookmark = pgTable(
  "bookmark",
  {
    userId: userRef(),
    targetType: targetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const flagStatus = pgEnum("flag_status", ["open", "resolved"]);

/** "Flag a problem" reports. The reporter is kept for follow-up and set null if they delete their account. */
export const flag = pgTable(
  "flag",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    targetType: targetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: flagStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("flag_status_idx").on(t.status, t.createdAt)],
);

/** Every email the app sends, kept as an audit trail; delivery goes over SMTP when SMTP_URL is set (server/email.ts). */
export const outboxEmail = pgTable("outbox_email", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Hands-on lab sessions (Phase 2). The web app creates the row and asks the lab controller to provision it;
 * the controller owns every later status change. Lab content is referenced by id without a foreign key, like
 * lessons and questions. One active session per learner is enforced by a partial unique index.
 */
export const labSessionStatus = pgEnum("lab_session_status", [
  "requested",
  "booting",
  "ready",
  "finished",
  "expired",
  "failed",
  "killed",
]);

export interface LabResourcesJson {
  provider: string;
  [key: string]: unknown;
}

export interface LabCheckResultJson {
  taskId: string;
  checkId: string;
  passed: boolean;
  /** Learner-facing message: the check's description when it passes, its fail message when it fails. */
  message: string;
  /** Raw grader output for admins; never shown to the learner. */
  detail?: string;
}

export interface PlayerStateJson {
  current: number;
  flags: string[];
  tab: "tasks" | "docs";
  doc: number;
}

export const labSession = pgTable(
  "lab_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    labId: text("lab_id").notNull(),
    certCode: text("cert_code").notNull(),
    status: labSessionStatus("status").notNull().default("requested"),
    /** Provider that runs the session: "local-docker" (Phase 2, local), later "aws" or "azure". */
    provider: text("provider").notNull(),
    /** Index of the current boot step, and the last message from the controller. */
    bootStep: integer("boot_step").notNull().default(0),
    statusMessage: text("status_message"),
    resources: jsonb("resources").$type<LabResourcesJson>(),
    /** Minutes the learner gets once the terminal is ready (the lab's length). */
    minutes: integer("minutes").notNull(),
    extended: boolean("extended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    /** Set when the session becomes ready; the sweeper ends the session after it. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Final score in percent, from the last grading when the session ended. */
    score: integer("score"),
    /** Estimated cloud cost in US cents; 0 for local Docker. */
    costCents: integer("cost_cents").notNull().default(0),
    /**
     * "lab" for a lab; "exam" or "practice" for a practical mock exam attempt. Exam mode gives no feedback until
     * the end; practice mode allows a check per task.
     */
    mode: text("mode").$type<"lab" | "exam" | "practice">().notNull().default("lab"),
    /**
     * Mock exams: when the learner pressed Start. The clusters are ready before that (the prepare screen); the
     * exam clock (expiresAt) starts here. Null for labs, whose clock starts when the terminal is ready.
     */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Mock exams: how often the learner left the exam window (page hidden). Shown in the results only. */
    windowLeaves: integer("window_leaves").notNull().default(0),
    /** Where the learner was in the player (exercise, flags, panel), so a refresh or another browser resumes there. */
    playerState: jsonb("player_state").$type<PlayerStateJson>(),
    /**
     * Set by the controller when it starts ending the session (final grading, then deletion), so a player opened
     * meanwhile shows the grading screen instead of a terminal that is about to close.
     */
    endingAt: timestamp("ending_at", { withTimezone: true }),
  },
  (t) => [
    index("lab_session_user_idx").on(t.userId, t.createdAt),
    index("lab_session_status_idx").on(t.status),
    index("lab_session_mode_idx").on(t.userId, t.mode, t.certCode, t.startedAt),
    uniqueIndex("lab_session_one_active_idx")
      .on(t.userId)
      .where(sql`${t.status} in ('requested', 'booting', 'ready')`),
  ],
);

export const labCheckKind = pgEnum("lab_check_kind", ["check", "final"]);

/** One grading run: "Check my work" during the lab, or the final grading when it ends. */
export const labCheckRun = pgTable(
  "lab_check_run",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => labSession.id, { onDelete: "cascade" }),
    kind: labCheckKind("kind").notNull(),
    results: jsonb("results").$type<LabCheckResultJson[]>().notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lab_check_run_session_idx").on(t.sessionId, t.createdAt)],
);

/** Hints a learner opened, in order per task. */
export const labHintUse = pgTable(
  "lab_hint_use",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => labSession.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    hintIndex: integer("hint_index").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.taskId, t.hintIndex] })],
);

/**
 * One row per save in the admin content editor: who changed which lesson, question, lab or mock exam, and the
 * item as it was after the change (in the content file format), so an admin can see the history and restore an
 * earlier version. No foreign key to the content tables: history outlives a deleted item.
 */
export const contentRevision = pgTable(
  "content_revision",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    itemType: text("item_type").$type<"lesson" | "question" | "lab" | "mock">().notNull(),
    itemId: text("item_id").notNull(),
    /** created, updated, published, unpublished, deleted, restored, reverted (back to the file version). */
    action: text("action").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** The item after the change, as the editor's JSON (null for a delete or a revert). */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_revision_item_idx").on(t.itemType, t.itemId, t.createdAt)],
);
