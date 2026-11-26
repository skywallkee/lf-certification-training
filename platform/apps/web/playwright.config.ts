import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build (`next build` first) and a disposable Postgres database.
 * E2E_DATABASE_URL is wiped, migrated, loaded with content and seeded with the sample learners by e2e/setup-db.ts,
 * which runs in the webServer command before the server starts. The lab controller starts second (Playwright starts
 * web servers in order) with LAB_PROVIDER=fake.
 */
const port = Number(process.env.E2E_PORT ?? 4100);
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  "postgres://postgres@localhost:4432/lfct_test";
const controllerPort = Number(process.env.E2E_CONTROLLER_PORT ?? 4101);
/** The web app and the lab controller share these; the controller uses the fake provider, so no Docker is needed. */
const labEnv = {
  LAB_CONTROLLER_SECRET: "e2e-controller-secret",
  LAB_TOKEN_SECRET: "e2e-token-secret-0123456789abcdefghijklmnop",
};

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
  webServer: [
    {
      command: `pnpm exec tsx e2e/setup-db.ts && pnpm exec next start -p ${port}`,
      url: `http://localhost:${port}/sign-in`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdefghijklmnopqrstuvwxyz",
        BETTER_AUTH_URL: `http://localhost:${port}`,
        ADMIN_EMAILS: "admin@example.com",
        ...labEnv,
        LAB_CONTROLLER_URL: `http://localhost:${controllerPort}`,
        LAB_TERMINAL_URL: `ws://localhost:${controllerPort}`,
        LAB_PROVIDER_NAME: "fake",
        LAB_DOCS_URL: `http://{host}.localhost:${controllerPort}`,
        // The reminder tests call the run endpoint themselves.
        REMINDERS_INTERVAL_MINUTES: "0",
      },
    },
    {
      command: "pnpm --filter @lfct/lab-controller start",
      url: `http://localhost:${controllerPort}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...labEnv,
        DATABASE_URL: databaseUrl,
        LAB_PROVIDER: "fake",
        LAB_CONTROLLER_PORT: String(controllerPort),
        LAB_ALLOWED_ORIGINS: `http://localhost:${port}`,
        FAKE_STEP_MS: "100",
      },
    },
  ],
});
