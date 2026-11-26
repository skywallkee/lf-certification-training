/**
 * One-step database setup for the local Docker stack (the compose "setup" service) and fresh clones:
 * applies both migration sets, ingests the curriculum and content (sample set included), and seeds the
 * sample learners the first time only, so `docker compose up` again keeps your progress. The sample cohort for the
 * admin analytics page is added on its own when it is missing.
 * Set SEED=always to reset the sample learners, or SEED=never to skip them.
 *
 * Everything runs in this one process, so the container image can ship it as a single bundled file
 * (see scripts/bundle.mjs at the repository root) without pnpm, tsx or node_modules.
 */
import { ContentError, CurriculumError, ingestAll } from "@lfct/curriculum/ingest";
import pg from "pg";
import { migrateAll } from "./migrate.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.ts";
import { todayIn } from "../src/lib/dates.ts";
import { COHORT_DOMAIN, seedCohort } from "./seed-cohort.ts";
import { seedDiscussions } from "./seed-discussions.ts";
import { SAMPLE_EMAILS, SAMPLE_USERS, seed } from "./seed.ts";

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
  const cohort = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM "user" WHERE email LIKE $1', [`%@${COHORT_DOMAIN}`]);
  if (mode === "always" || rows[0]!.n === 0) {
    await pool.end();
    await seed(url);
  } else {
    console.log("Sample learners already exist; keeping them (SEED=always resets them).");
    // Databases seeded before the analytics page existed get the sample cohort on their own.
    if (cohort.rows[0]!.n === 0) console.log(`Seeded ${await seedCohort(drizzle(pool, { schema }), todayIn("UTC"))} sample cohort learners for the admin analytics page.`);
    // Likewise sample discussions, for databases seeded before discussions existed (and only while there are none).
    const posts = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM discussion_post");
    if (posts.rows[0]!.n === 0) {
      const users = await pool.query<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE email = ANY($1)', [SAMPLE_EMAILS]);
      const byEmail = new Map(users.rows.map((u) => [u.email, u.id]));
      const ids = Object.fromEntries(Object.entries(SAMPLE_USERS).map(([k, u]) => [k, byEmail.get(u.email)]));
      if (Object.values(ids).every(Boolean)) {
        console.log(`Seeded ${await seedDiscussions(drizzle(pool, { schema }), ids as Parameters<typeof seedDiscussions>[1])} sample discussion posts.`);
      }
    }
    await pool.end();
  }
}
