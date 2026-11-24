import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build (`next build` first) and a disposable Postgres database.
 * E2E_DATABASE_URL is wiped, migrated, loaded with content and seeded with the sample learners by e2e/setup-db.ts,
 * which runs in the webServer command before the server starts.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/lfct_test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec tsx e2e/setup-db.ts && pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdefghijklmnopqrstuvwxyz",
      BETTER_AUTH_URL: `http://localhost:${port}`,
      ADMIN_EMAILS: "admin@example.com",
    },
  },
});
