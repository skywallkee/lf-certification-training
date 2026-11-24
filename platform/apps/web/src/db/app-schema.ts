import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

/** Emails the app would send. Phase 1 has no mail provider: messages land here and in the server log. */
export const outboxEmail = pgTable("outbox_email", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
