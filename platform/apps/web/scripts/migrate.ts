import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrateCurriculum } from "@lfct/curriculum/ingest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** The web app's migrations, next to this script. */
export const WEB_MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../drizzle");

/** Applies the curriculum package's migrations, then the web app's. */
export async function migrateAll(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    await migrateCurriculum(db as never);
    await migrate(db, { migrationsFolder: WEB_MIGRATIONS_DIR, migrationsTable: "__drizzle_migrations_web" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  await migrateAll(url);
}
