import * as content from "@lfct/curriculum/db";
import * as app from "@lfct/web/db/schema";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export const schema = { ...content, ...app };
export type Db = NodePgDatabase<typeof schema>;

export function connect(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}

export type LabRow = typeof content.lab.$inferSelect;
export type SessionRow = typeof app.labSession.$inferSelect;
