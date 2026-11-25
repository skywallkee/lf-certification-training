import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Curriculum and content tables, loaded from content/ by the ingest job. The web app reads them;
 * nothing but the ingest job writes them. Lessons and questions reference competency.ref by value
 * (not by foreign key) so a curriculum revision never cascades into content.
 */

export const examStyle = pgEnum("exam_style", ["performance", "multiple-choice"]);
export const verification = pgEnum("curriculum_verification", ["text", "visual", "pending"]);

export const certification = pgTable("certification", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  examStyle: examStyle("exam_style").notNull(),
  durationMinutes: integer("duration_minutes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const program = pgTable("program", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const programMember = pgTable(
  "program_member",
  {
    programKey: text("program_key")
      .notNull()
      .references(() => program.key, { onDelete: "cascade" }),
    certCode: text("cert_code")
      .notNull()
      .references(() => certification.code),
    requiredFrom: date("required_from"),
    retiredAt: date("retired_at"),
  },
  (t) => [primaryKey({ columns: [t.programKey, t.certCode] })],
);

/** One row per distinct curriculum content of a cert. Old versions stay so past attempts keep their context. */
export const curriculumVersion = pgTable(
  "curriculum_version",
  {
    /** `<CODE>:<first 16 hex chars of the content hash>`. */
    id: text("id").primaryKey(),
    certCode: text("cert_code")
      .notNull()
      .references(() => certification.code),
    version: text("version"),
    sourceUrl: text("source_url").notNull(),
    sourceCommit: text("source_commit"),
    sourceBlobSha: text("source_blob_sha"),
    retrievedAt: date("retrieved_at").notNull(),
    effectiveFrom: date("effective_from"),
    verification: verification("verification").notNull(),
    contentHash: text("content_hash").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("curriculum_version_cert_idx").on(t.certCode),
    uniqueIndex("curriculum_version_one_current_idx").on(t.certCode).where(sql`${t.isCurrent}`),
  ],
);

export const domain = pgTable(
  "domain",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    versionId: text("version_id")
      .notNull()
      .references(() => curriculumVersion.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    weight: integer("weight").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("domain_version_key_idx").on(t.versionId, t.key)],
);

export const competency = pgTable(
  "competency",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    domainId: integer("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "cascade" }),
    /** Stable id used to tag content: `<cert>/<domain>/<competency>`. */
    ref: text("ref").notNull(),
    statement: text("statement").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("competency_domain_ref_idx").on(t.domainId, t.ref), index("competency_ref_idx").on(t.ref)],
);

export interface DocLinkJson {
  title: string;
  url: string;
}

export interface QuestionOptionJson {
  id: string;
  text: string;
  correct: boolean;
}

/** MDX lessons, one row per file in content/lessons. Keyed by the lesson's stable id. */
export const lesson = pgTable(
  "lesson",
  {
    id: text("id").primaryKey(),
    certCode: text("cert_code")
      .notNull()
      .references(() => certification.code),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    minutes: integer("minutes").notNull(),
    body: text("body").notNull(),
    docs: jsonb("docs").$type<DocLinkJson[]>().notNull(),
    competencyRefs: text("competency_refs").array().notNull(),
    mock: boolean("mock").notNull().default(false),
    file: text("file").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_cert_idx").on(t.certCode), index("lesson_refs_idx").using("gin", t.competencyRefs)],
);

export const questionKind = pgEnum("question_kind", ["single", "multiple"]);

/** Multiple-choice questions, one row per item in content/questions. Keyed by the question's stable id. */
export const question = pgTable(
  "question",
  {
    id: text("id").primaryKey(),
    certCode: text("cert_code")
      .notNull()
      .references(() => certification.code),
    kind: questionKind("kind").notNull(),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<QuestionOptionJson[]>().notNull(),
    explanation: text("explanation").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull(),
    competencyRefs: text("competency_refs").array().notNull(),
    mock: boolean("mock").notNull().default(false),
    knownIssue: text("known_issue"),
    file: text("file").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("question_cert_idx").on(t.certCode), index("question_refs_idx").using("gin", t.competencyRefs)],
);

export interface LabCheckJson {
  id: string;
  description: string;
  failMessage?: string;
  assert?: Record<string, unknown>;
  namespace?: string;
  script?: string;
  runIn: "grader" | "workstation";
}

export interface LabTaskJson {
  id: string;
  title: string;
  weight: number;
  body: string;
  hints: string[];
  checks: LabCheckJson[];
}

/**
 * Hands-on labs, one row per file in content/labs. Tasks carry their checks; the web app never sends checks
 * or the solution to the browser before the session ends. Keyed by the lab's stable id.
 */
export const lab = pgTable(
  "lab",
  {
    id: text("id").primaryKey(),
    certCode: text("cert_code")
      .notNull()
      .references(() => certification.code),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    tier: integer("tier").notNull(),
    minutes: integer("minutes").notNull(),
    docs: jsonb("docs").$type<DocLinkJson[]>().notNull(),
    images: text("images").array().notNull(),
    setup: text("setup"),
    solution: text("solution").notNull(),
    tasks: jsonb("tasks").$type<LabTaskJson[]>().notNull(),
    competencyRefs: text("competency_refs").array().notNull(),
    mock: boolean("mock").notNull().default(false),
    file: text("file").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lab_cert_idx").on(t.certCode), index("lab_refs_idx").using("gin", t.competencyRefs)],
);

/** One row per ingest run, for the admin page. */
export const ingestRun = pgTable("ingest_run", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  curriculumVersionsAdded: integer("curriculum_versions_added").notNull().default(0),
  lessons: integer("lessons").notNull().default(0),
  questions: integer("questions").notNull().default(0),
  labs: integer("labs").notNull().default(0),
  includeSample: boolean("include_sample").notNull(),
  ok: boolean("ok").notNull().default(false),
  message: text("message"),
});
