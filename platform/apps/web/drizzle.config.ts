import { defineConfig } from "drizzle-kit";

/**
 * The web app's own tables (auth and learner data). The curriculum and content tables belong to
 * @lfct/curriculum and have their own migrations; the two sets use separate migration tables.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/auth-schema.ts", "./src/db/app-schema.ts"],
  out: "./drizzle",
  migrations: { table: "__drizzle_migrations_web" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/lfct" },
});
