/**
 * Resets the e2e database: drops everything, runs both migration sets, ingests the curriculum and the sample
 * content, and seeds the sample learners. Runs as part of the Playwright webServer command, before `next start`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { seed } from "../scripts/seed.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production" && !process.env.E2E_ALLOW_RESET) throw new Error("refusing to reset a database with NODE_ENV=production");

const pool = new pg.Pool({ connectionString: url });
await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
await pool.end();
const appDir = path.resolve(import.meta.dirname, "..");
execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], { cwd: appDir, stdio: "inherit" });
execFileSync("pnpm", ["curriculum:ingest"], { cwd: path.resolve(appDir, "../../.."), stdio: "inherit" });
await seed(url);
console.log("e2e database ready");
