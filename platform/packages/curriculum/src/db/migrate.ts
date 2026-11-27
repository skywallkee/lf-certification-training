import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Applies a folder of drizzle migrations, including any that drizzle's own migrator skips.
 *
 * drizzle only applies migrations whose journal time is later than the newest one recorded in the database. A
 * database that has ever recorded a later migration (from a branch that was tried locally, a renumbered migration,
 * or two branches generated on the same day and merged in the other order) silently skips the older one, and the
 * app then fails on a missing column. After drizzle's pass, this applies every journal entry whose time is not
 * recorded yet, in journal order, each in its own transaction, and returns the tags it had to apply.
 */
export async function migrateFolder(db: NodePgDatabase<Record<string, unknown>>, folder: string, table: string): Promise<string[]> {
  await migrate(db, { migrationsFolder: folder, migrationsTable: table });
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
  const tagOf = new Map(journal.entries.map((e) => [e.when, e.tag]));
  const rows = await db.execute<{ created_at: string | null }>(sql`select created_at from drizzle.${sql.identifier(table)}`);
  const recorded = new Set(rows.rows.map((r) => Number(r.created_at)));
  const applied: string[] = [];
  for (const m of migrations) {
    if (recorded.has(m.folderMillis)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of m.sql) if (stmt.trim()) await tx.execute(sql.raw(stmt));
      await tx.execute(sql`insert into drizzle.${sql.identifier(table)} ("hash", "created_at") values (${m.hash}, ${m.folderMillis})`);
    });
    applied.push(tagOf.get(m.folderMillis) ?? String(m.folderMillis));
  }
  if (applied.length) console.warn(`Applied migrations that drizzle had skipped (${table}): ${applied.join(", ")}`);
  return applied;
}
