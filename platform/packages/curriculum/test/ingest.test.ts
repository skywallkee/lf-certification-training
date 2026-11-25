import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestContent, ingestCurriculum, migrateAndIngest, removeSampleContent } from "../src/db/ingest.ts";
import * as schema from "../src/db/schema.ts";
import { loadContent, loadCurriculum, type Curriculum } from "../src/index.ts";

/** Runs against a disposable database: TEST_DATABASE_URL=postgres://postgres@localhost:5432/lfct_test */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("ingest into Postgres", () => {
  let pool: pg.Pool;
  let curriculum: Curriculum;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    curriculum = await loadCurriculum();
  });
  afterAll(async () => pool.end());

  it("migrates and loads every cert, domain and competency", async () => {
    const result = await migrateAndIngest(url!, curriculum);
    expect(result.inserted).toHaveLength(17);
    const counts = await pool.query(
      "SELECT (SELECT count(*) FROM certification)::int AS certs, (SELECT count(*) FROM competency)::int AS comps, " +
        "(SELECT count(*) FROM program_member WHERE program_key = 'golden-kubestronaut')::int AS golden",
    );
    expect(counts.rows[0]).toEqual({ certs: 17, comps: curriculum.competencies.size, golden: 17 });
  });

  it("is a no-op when nothing changed", async () => {
    const result = await migrateAndIngest(url!, curriculum);
    expect(result.inserted).toEqual([]);
    expect(result.unchanged).toHaveLength(17);
  });

  it("adds a new current version when a curriculum changes and keeps the old one", async () => {
    const cka = curriculum.certs.get("CKA")!;
    const revised = structuredClone(cka);
    revised.curriculum.version = "1.38";
    const changed: Curriculum = { ...curriculum, certs: new Map(curriculum.certs).set("CKA", revised) };
    const db = drizzle(pool, { schema });
    const result = await ingestCurriculum(db, changed);
    expect(result.inserted).toHaveLength(1);
    const versions = await db
      .select({ version: schema.curriculumVersion.version, isCurrent: schema.curriculumVersion.isCurrent })
      .from(schema.curriculumVersion)
      .where(eq(schema.curriculumVersion.certCode, "CKA"));
    expect(versions.sort((a, b) => (a.version ?? "").localeCompare(b.version ?? ""))).toEqual([
      { version: "1.37", isCurrent: false },
      { version: "1.38", isCurrent: true },
    ]);
  });
});

describe.skipIf(!url)("content ingest", () => {
  let pool: pg.Pool;
  let curriculum: Curriculum;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    curriculum = await loadCurriculum();
  });
  afterAll(async () => pool.end());

  const counts = async () =>
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM lesson)::int AS lessons, (SELECT count(*) FROM question)::int AS questions, " +
          "(SELECT count(*) FROM ingest_run WHERE ok)::int AS runs",
      )
    ).rows[0];

  it("loads the sample lessons and questions and records the run", async () => {
    const before = (await counts()).runs;
    const result = await migrateAndIngest(url!, curriculum, await loadContent(curriculum), { includeSample: true });
    expect(result.content).toMatchObject({ lessons: 12, questions: 60, labs: 6 });
    expect(await counts()).toEqual({ lessons: 12, questions: 60, runs: before + 1 });
  });

  it("removes the sample set in one step", async () => {
    const db = drizzle(pool, { schema });
    expect(await removeSampleContent(db)).toEqual({ lessons: 12, questions: 60, labs: 6 });
    expect(await counts()).toMatchObject({ lessons: 0, questions: 0 });
  });

  it("drops rows that are no longer in the content, such as the sample set when it is left out", async () => {
    const db = drizzle(pool, { schema });
    await ingestContent(db, await loadContent(curriculum));
    const result = await ingestContent(db, await loadContent(curriculum, { includeSample: false }));
    expect(result).toEqual({ lessons: 0, questions: 0, labs: 0, removedLessons: 12, removedQuestions: 60, removedLabs: 6 });
  });
});
