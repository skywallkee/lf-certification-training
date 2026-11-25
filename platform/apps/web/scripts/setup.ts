/**
 * One-step database setup for the local Docker stack (the compose "setup" service) and fresh clones:
 * applies both migration sets, ingests the curriculum and content (sample set included), and seeds the
 * sample learners the first time only, so `docker compose up` again keeps your progress.
 * Set SEED=always to reset the sample learners, or SEED=never to skip them.
 *
 * Everything runs in this one process, so the container image can ship it as a single bundled file
 * (see scripts/bundle.mjs at the repository root) without pnpm, tsx or node_modules.
 */
import { ContentError, CurriculumError, ingestAll } from "@lfct/curriculum/ingest";
import pg from "pg";
import { migrateAll } from "./migrate.ts";
import { SAMPLE_EMAILS, seed } from "./seed.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
try {
  await migrateAll(url);
  console.log(await ingestAll(url, { includeSample: process.env.CONTENT_INCLUDE_SAMPLE !== "false" }));
} catch (err) {
  if (err instanceof CurriculumError || err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const mode = process.env.SEED ?? "if-missing";
if (mode !== "never") {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM "user" WHERE email = ANY($1)', [SAMPLE_EMAILS]);
  await pool.end();
  if (mode === "always" || rows[0]!.n === 0) await seed(url);
  else console.log("Sample learners already exist; keeping them (SEED=always resets them).");
}
