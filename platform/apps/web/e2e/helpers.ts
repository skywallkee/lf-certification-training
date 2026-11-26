import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = "sample-password-123";
export const DB_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:4432/lfct_test";

/** Signs in and waits to leave the sign-in page. */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await submitSignIn(page, email, password);
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

/** Submits the sign-in form without expecting it to succeed. */
export async function submitSignIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in with email" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
}

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** WCAG 2.2 AA checks with axe. Fails the test on any violation and lists them. */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}: ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}
