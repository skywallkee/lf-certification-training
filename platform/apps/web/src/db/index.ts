import "server-only";
import * as content from "@lfct/curriculum/db";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.ts";
import * as app from "./schema.ts";

export const schema = { ...content, ...app };
export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { lfctPool?: pg.Pool };

function pool(): pg.Pool {
  globalForDb.lfctPool ??= new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
  return globalForDb.lfctPool;
}

let instance: Db | undefined;

/** The shared Drizzle client. Created on first use so builds do not need a database. */
export function getDb(): Db {
  instance ??= drizzle(pool(), { schema });
  return instance;
}
