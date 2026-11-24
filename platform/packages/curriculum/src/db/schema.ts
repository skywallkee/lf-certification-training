import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Curriculum tables, loaded from content/curriculum by the ingest job. The web app reads them;
 * nothing but the ingest job writes them. Lessons, questions, labs and attempts arrive in later phases
 * and reference competency.ref.
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
