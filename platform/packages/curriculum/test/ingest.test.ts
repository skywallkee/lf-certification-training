import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestContent, ingestCurriculum, migrateAndIngest, removeSampleContent, RETIRED_SAMPLE_LESSON_IDS } from "../src/db/ingest.ts";
import * as schema from "../src/db/schema.ts";
import { loadContent, loadCurriculum, type Curriculum } from "../src/index.ts";

/** Runs against a disposable database: TEST_DATABASE_URL=postgres://postgres@localhost:4432/lfct_test */
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

  it("applies a migration that drizzle skipped because a later one was already recorded", async () => {
    // A database that recorded a later migration (from another branch) before lesson media existed.
    await pool.query("ALTER TABLE lesson DROP COLUMN video, DROP COLUMN diagrams");
    await pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations)");
    await pool.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('from-another-branch', 9999999999999)");
    await migrateAndIngest(url!, curriculum);
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lesson' AND column_name IN ('video', 'diagrams') ORDER BY 1");
    expect(cols.rows.map((r) => r.column_name)).toEqual(["diagrams", "video"]);
    await pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE hash = 'from-another-branch'");
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

  // The sample set is counted on its own (items marked `mock: true`), so real content can be added without
  // touching these tests. It has no lessons since the real CKA lessons replaced the sample ones.
  const SAMPLE = { lessons: 0, questions: 74, labs: 8, quizMocks: 3 };
  const sizes = (c: Awaited<ReturnType<typeof loadContent>>) => ({
    lessons: c.lessons.length,
    questions: c.questions.length,
    labs: c.labs.length,
    quizMocks: c.quizMocks.length,
  });

  it("loads the lessons and the sample questions and records the run", async () => {
    const before = (await counts()).runs;
    const content = await loadContent(curriculum);
    const real = sizes(await loadContent(curriculum, { includeSample: false }));
    expect(sizes(content)).toEqual({
      lessons: real.lessons + SAMPLE.lessons,
      questions: real.questions + SAMPLE.questions,
      labs: real.labs + SAMPLE.labs,
      quizMocks: real.quizMocks + SAMPLE.quizMocks,
    });
    const result = await migrateAndIngest(url!, curriculum, content, { includeSample: true });
    expect(result.content).toMatchObject(sizes(content));
    expect(await counts()).toEqual({ lessons: content.lessons.length, questions: content.questions.length, runs: before + 1 });
  });

  it("removes the sample set in one step", async () => {
    const db = drizzle(pool, { schema });
    const real = sizes(await loadContent(curriculum, { includeSample: false }));
    expect(await removeSampleContent(db)).toEqual(SAMPLE);
    expect(await counts()).toMatchObject({ lessons: real.lessons, questions: real.questions });
  });

  it("drops rows that are no longer in the content, such as the sample set when it is left out", async () => {
    const db = drizzle(pool, { schema });
    await ingestContent(db, await loadContent(curriculum));
    const withoutSample = await loadContent(curriculum, { includeSample: false });
    const result = await ingestContent(db, withoutSample);
    expect(result).toEqual({
      ...sizes(withoutSample),
      removedLessons: SAMPLE.lessons,
      removedQuestions: SAMPLE.questions,
      removedLabs: SAMPLE.labs,
      removedQuizMocks: SAMPLE.quizMocks,
    });
  });

  it("never overwrites or deletes items created or edited in the admin editor", async () => {
    const db = drizzle(pool, { schema });
    const content = await loadContent(curriculum);
    await ingestContent(db, content);
    const edited = content.questions.find((q) => q.mock)!;
    await db.update(schema.question).set({ stem: "Edited in the app", origin: "app" }).where(eq(schema.question.id, edited.id));
    await db.insert(schema.question).values({
      id: "app-only-question",
      certCode: "CKA",
      kind: "single",
      stem: "Made in the app?",
      options: [
        { id: "a", text: "Yes", correct: true },
        { id: "b", text: "No", correct: false },
      ],
      explanation: "It was.",
      sourceTitle: "Kubernetes docs",
      sourceUrl: "https://kubernetes.io/docs/",
      competencyRefs: [content.questions[0]!.competencies[0]!],
      mock: true,
      origin: "app",
      published: false,
      file: "app",
      contentHash: "x",
    });
    await ingestContent(db, content);
    const [questionRow] = await db.select().from(schema.question).where(eq(schema.question.id, edited.id));
    expect(questionRow?.stem).toBe("Edited in the app");
    const withoutSample = await loadContent(curriculum, { includeSample: false });
    const result = await ingestContent(db, withoutSample);
    expect(result).toMatchObject({ removedLessons: 0, removedQuestions: SAMPLE.questions - 1 });
    const left = await pool.query("SELECT id FROM lesson UNION ALL SELECT id FROM question");
    const real = [...withoutSample.lessons, ...withoutSample.questions].map((i) => i.id);
    expect(left.rows.map((r) => r.id).sort()).toEqual(["app-only-question", edited.id, ...real].sort());
  });

  it("deletes the retired sample lessons from an older database, even copies edited in the app", async () => {
    const db = drizzle(pool, { schema });
    const content = await loadContent(curriculum);
    await ingestContent(db, content);
    const competency = content.questions[0]!.competencies[0]!;
    const row = (id: string, origin: "file" | "app") => ({
      id,
      certCode: content.questions[0]!.cert,
      title: id,
      summary: "Left over from the sample set",
      minutes: 5,
      body: "Old",
      docs: [],
      competencyRefs: [competency],
      mock: true,
      origin,
      file: `lessons/sample/${id}.mdx`,
      contentHash: "x",
    });
    await db.insert(schema.lesson).values([row(RETIRED_SAMPLE_LESSON_IDS[0]!, "file"), row(RETIRED_SAMPLE_LESSON_IDS[1]!, "app")]);
    const result = await ingestContent(db, content);
    expect(result.removedLessons).toBe(2);
    const left = await pool.query("SELECT id FROM lesson WHERE id = ANY($1)", [RETIRED_SAMPLE_LESSON_IDS]);
    expect(left.rows).toEqual([]);
  });
});
