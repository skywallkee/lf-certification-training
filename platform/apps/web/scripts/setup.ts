/**
 * One-step database setup for the local Docker stack (the compose "setup" service) and fresh clones:
 * applies both migration sets, ingests the curriculum and content (sample set included), and seeds the
 * sample learners the first time only, so `docker compose up` again keeps your progress.
 * Set SEED=always to reset the sample learners, or SEED=never to skip them.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { SAMPLE_EMAILS, seed } from "./seed.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const appDir = path.resolve(import.meta.dirname, "..");
execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], { cwd: appDir, stdio: "inherit" });
execFileSync("pnpm", ["curriculum:ingest"], { cwd: path.resolve(appDir, "../../.."), stdio: "inherit" });

const mode = process.env.SEED ?? "if-missing";
if (mode !== "never") {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM "user" WHERE email = ANY($1)', [SAMPLE_EMAILS]);
  await pool.end();
  if (mode === "always" || rows[0]!.n === 0) await seed(url);
  else console.log("Sample learners already exist; keeping them (SEED=always resets them).");
}
