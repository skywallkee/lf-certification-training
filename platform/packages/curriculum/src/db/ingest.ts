import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { loadContent, type Content } from "../content.ts";
import { loadCurriculum, type Cert, type Curriculum } from "../load.ts";
import { sourceUrl } from "../queries.ts";
import * as schema from "./schema.ts";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export { ContentError } from "../content.ts";
export { CurriculumError } from "../load.ts";

export type Db = NodePgDatabase<typeof schema>;

/** Hash of everything that defines a curriculum version, so unchanged YAML is a no-op on re-ingest. */
export function contentHash(cert: Cert): string {
  const canonical = JSON.stringify({
    code: cert.code,
    curriculum: cert.curriculum,
    domains: cert.domains.map((d) => ({
      key: d.key,
      name: d.name,
      weight: d.weight,
      competencies: d.competencies.map((c) => [c.key, c.statement]),
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface IngestResult {
  certs: number;
  inserted: string[];
  unchanged: string[];
}

/** Loads the curriculum into Postgres in one transaction. Idempotent: re-running with the same YAML changes nothing. */
export async function ingestCurriculum(db: Db, curriculum: Curriculum): Promise<IngestResult> {
  const result: IngestResult = { certs: curriculum.certs.size, inserted: [], unchanged: [] };
  await db.transaction(async (tx) => {
    for (const cert of curriculum.certs.values()) {
      await tx
        .insert(schema.certification)
        .values({
          code: cert.code,
          name: cert.name,
          examStyle: cert.examStyle,
          durationMinutes: cert.durationMinutes ?? null,
        })
        .onConflictDoUpdate({
          target: schema.certification.code,
          set: {
            name: cert.name,
            examStyle: cert.examStyle,
            durationMinutes: cert.durationMinutes ?? null,
            updatedAt: new Date(),
          },
        });

      const hash = contentHash(cert);
      const versionId = `${cert.code}:${hash.slice(0, 16)}`;
      const existing = await tx
        .select({ id: schema.curriculumVersion.id })
        .from(schema.curriculumVersion)
        .where(eq(schema.curriculumVersion.id, versionId));

      if (existing.length === 0) {
        const src = cert.curriculum.source;
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: false })
          .where(eq(schema.curriculumVersion.certCode, cert.code));
        await tx.insert(schema.curriculumVersion).values({
          id: versionId,
          certCode: cert.code,
          version: cert.curriculum.version ?? null,
          sourceUrl: sourceUrl(cert),
          sourceCommit: src.kind === "cncf-curriculum" ? src.commit : null,
          sourceBlobSha: src.kind === "cncf-curriculum" ? src.blobSha : null,
          retrievedAt: cert.curriculum.retrievedAt,
          effectiveFrom: cert.curriculum.effectiveFrom ?? null,
          verification: cert.curriculum.verification,
          contentHash: hash,
          isCurrent: true,
        });
        for (const [i, d] of cert.domains.entries()) {
          const [row] = await tx
            .insert(schema.domain)
            .values({ versionId, key: d.key, name: d.name, weight: d.weight, position: i })
            .returning({ id: schema.domain.id });
          if (!row) throw new Error(`failed to insert domain ${d.id}`);
          if (d.competencies.length > 0) {
            await tx.insert(schema.competency).values(
              d.competencies.map((c, j) => ({ domainId: row.id, ref: c.id, statement: c.statement, position: j })),
            );
          }
        }
        result.inserted.push(versionId);
      } else {
        // Same content: make sure it is the current one (e.g. after a revert to an earlier YAML).
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: false })
          .where(and(eq(schema.curriculumVersion.certCode, cert.code), ne(schema.curriculumVersion.id, versionId)));
        await tx
          .update(schema.curriculumVersion)
          .set({ isCurrent: true })
          .where(eq(schema.curriculumVersion.id, versionId));
        result.unchanged.push(versionId);
      }
    }

    for (const p of curriculum.programs) {
      await tx
        .insert(schema.program)
        .values({ key: p.key, name: p.name, sourceUrl: p.source })
        .onConflictDoUpdate({ target: schema.program.key, set: { name: p.name, sourceUrl: p.source } });
      await tx.delete(schema.programMember).where(eq(schema.programMember.programKey, p.key));
      await tx.insert(schema.programMember).values(
        p.members.map((m) => ({
          programKey: p.key,
          certCode: m.cert,
          requiredFrom: m.requiredFrom ?? null,
          retiredAt: m.retiredAt ?? null,
        })),
      );
    }
  });
  return result;
}

export interface ContentIngestResult {
  lessons: number;
  questions: number;
  labs: number;
  removedLessons: number;
  removedQuestions: number;
  removedLabs: number;
}

/**
 * Upserts lessons and questions and deletes rows whose file no longer exists (or that were left out,
 * such as the sample set when includeSample is false). Run after ingestCurriculum: rows reference
 * certification.code.
 */
export async function ingestContent(db: Db, content: Content): Promise<ContentIngestResult> {
  return db.transaction(async (tx) => {
    for (const l of content.lessons) {
      const values = {
        certCode: l.cert,
        title: l.title,
        summary: l.summary,
        minutes: l.minutes,
        body: l.body,
        docs: l.docs,
        competencyRefs: l.competencies,
        mock: l.mock,
        file: l.file,
        contentHash: l.hash,
      };
      await tx
        .insert(schema.lesson)
        .values({ id: l.id, ...values })
        .onConflictDoUpdate({ target: schema.lesson.id, set: { ...values, updatedAt: new Date() } });
    }
    for (const q of content.questions) {
      const values = {
        certCode: q.cert,
        kind: q.kind,
        stem: q.stem,
        options: q.options.map((o) => ({ id: o.id, text: o.text, correct: o.correct })),
        explanation: q.explanation,
        sourceTitle: q.source.title,
        sourceUrl: q.source.url,
        competencyRefs: q.competencies,
        mock: q.mock,
        knownIssue: q.knownIssue ?? null,
        file: q.file,
        contentHash: q.hash,
      };
      await tx
        .insert(schema.question)
        .values({ id: q.id, ...values })
        .onConflictDoUpdate({ target: schema.question.id, set: { ...values, updatedAt: new Date() } });
    }
    for (const l of content.labs) {
      const values = {
        certCode: l.cert,
        title: l.title,
        summary: l.summary,
        tier: l.tier,
        minutes: l.minutes,
        docs: l.docs,
        clusters: l.clusters,
        images: l.images,
        setup: l.setup ?? null,
        solution: l.solution,
        tasks: l.tasks.map((t) => ({ ...t, cluster: t.cluster ?? l.clusters[0]! })),
        competencyRefs: l.competencies,
        mock: l.mock,
        file: l.file,
        contentHash: l.hash,
      };
      await tx
        .insert(schema.lab)
        .values({ id: l.id, ...values })
        .onConflictDoUpdate({ target: schema.lab.id, set: { ...values, updatedAt: new Date() } });
    }
    const lessonIds = content.lessons.map((l) => l.id);
    const questionIds = content.questions.map((q) => q.id);
    const removedLessons = await tx
      .delete(schema.lesson)
      .where(lessonIds.length > 0 ? notInArray(schema.lesson.id, lessonIds) : undefined)
      .returning({ id: schema.lesson.id });
    const removedQuestions = await tx
      .delete(schema.question)
      .where(questionIds.length > 0 ? notInArray(schema.question.id, questionIds) : undefined)
      .returning({ id: schema.question.id });
    const labIds = content.labs.map((l) => l.id);
    const removedLabs = await tx
      .delete(schema.lab)
      .where(labIds.length > 0 ? notInArray(schema.lab.id, labIds) : undefined)
      .returning({ id: schema.lab.id });
    return {
      lessons: content.lessons.length,
      questions: content.questions.length,
      labs: content.labs.length,
      removedLessons: removedLessons.length,
      removedQuestions: removedQuestions.length,
      removedLabs: removedLabs.length,
    };
  });
}

/** Deletes every lesson, question and lab marked mock: the one-step removal of the sample set. */
export async function removeSampleContent(db: Db): Promise<{ lessons: number; questions: number; labs: number }> {
  const lessons = await db.delete(schema.lesson).where(eq(schema.lesson.mock, true)).returning({ id: schema.lesson.id });
  const questions = await db.delete(schema.question).where(eq(schema.question.mock, true)).returning({ id: schema.question.id });
  const labs = await db.delete(schema.lab).where(eq(schema.lab.mock, true)).returning({ id: schema.lab.id });
  return { lessons: lessons.length, questions: questions.length, labs: labs.length };
}

/** Applies the curriculum package's migrations. */
export async function migrateCurriculum(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/** Opens a pool, applies migrations, ingests, and closes the pool. Content is optional so the curriculum can load alone. */
export async function migrateAndIngest(
  databaseUrl: string,
  curriculum: Curriculum,
  content?: Content,
  opts: { includeSample?: boolean } = {},
): Promise<IngestResult & { content?: ContentIngestResult }> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const db = drizzle(pool, { schema });
    await migrateCurriculum(db);
    const [run] = await db
      .insert(schema.ingestRun)
      .values({ includeSample: opts.includeSample ?? true })
      .returning({ id: schema.ingestRun.id });
    try {
      const result = await ingestCurriculum(db, curriculum);
      const contentResult = content ? await ingestContent(db, content) : undefined;
      await db
        .update(schema.ingestRun)
        .set({
          finishedAt: new Date(),
          ok: true,
          curriculumVersionsAdded: result.inserted.length,
          lessons: contentResult?.lessons ?? 0,
          questions: contentResult?.questions ?? 0,
          labs: contentResult?.labs ?? 0,
        })
        .where(eq(schema.ingestRun.id, run!.id));
      return contentResult ? { ...result, content: contentResult } : result;
    } catch (err) {
      await db
        .update(schema.ingestRun)
        .set({ finishedAt: new Date(), ok: false, message: (err as Error).message.slice(0, 2000) })
        .where(eq(schema.ingestRun.id, run!.id));
      throw err;
    }
  } finally {
    await pool.end();
  }
}

/**
 * Loads content/ (curriculum, lessons, questions, labs), applies migrations and ingests it all. Returns a one-line
 * summary. Throws CurriculumError or ContentError when the YAML is invalid.
 */
export async function ingestAll(
  databaseUrl: string,
  opts: { includeSample?: boolean; curriculumDir?: string } = {},
): Promise<string> {
  const includeSample = opts.includeSample ?? true;
  const curriculum = await loadCurriculum(opts.curriculumDir);
  const content = await loadContent(curriculum, { includeSample });
  const result = await migrateAndIngest(databaseUrl, curriculum, content, { includeSample });
  return (
    `Ingested ${result.certs} certifications: ${result.inserted.length} new curriculum versions, ` +
    `${result.unchanged.length} unchanged. ${result.content?.lessons ?? 0} lessons, ` +
    `${result.content?.questions ?? 0} questions and ${result.content?.labs ?? 0} labs` +
    `${includeSample ? " (sample set included)" : ""}; removed ${result.content?.removedLessons ?? 0} lessons, ` +
    `${result.content?.removedQuestions ?? 0} questions and ${result.content?.removedLabs ?? 0} labs.`
  );
}
