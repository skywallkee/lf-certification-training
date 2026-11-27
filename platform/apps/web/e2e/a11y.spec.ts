import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

/**
 * WCAG 2.1 AA sweep over every page that needs no lab or quiz running (those are checked in their own flows):
 * axe in the light and the dark theme, one h1 and a page title on each page, no sideways scrolling at 320 CSS
 * pixels (1.4.10 Reflow), and a "Skip to content" link as the first Tab stop on pages with navigation.
 */

const PUBLIC = ["/", "/sign-in", "/sign-up", "/forgot-password", "/verify-email?email=someone%40example.com", "/reset-password?token=x", "/unsubscribe?u=x&t=y"];
const LEARNER = [
  "/today",
  "/plan",
  "/certs",
  "/certs/kcna",
  "/certs/kcna/readiness",
  "/certs/kcna/domains/kubernetes-fundamentals",
  "/certs/kcna/domains/kubernetes-fundamentals/competencies/kubernetes-core-concepts",
  "/practice",
  "/review",
  "/saved",
  "/search?q=pod",
  "/labs",
  "/labs/sample-cka-rbac-pod-reader",
  "/labs/history",
  "/mocks",
  "/mocks/history",
  "/account",
];
const ADMIN = ["/admin", "/admin/content", "/admin/labs", "/admin/analytics", "/admin/content/lesson/new", "/admin/content/question/new"];

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
}

async function checkPage(page: Page, path: string, theme: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} loads`).toBeLessThan(400);
  await expect(page.locator("h1"), `${path} has one h1`).toHaveCount(1);
  expect((await page.title()).trim(), `${path} has a title`).not.toBe("");
  await expectAccessible(page, `${path} (${theme})`);
}

for (const theme of ["light", "dark"] as const) {
  test(`public pages pass axe in the ${theme} theme`, async ({ page }) => {
    await setTheme(page, theme);
    for (const path of PUBLIC) await checkPage(page, path, theme);
  });

  test(`learner pages pass axe in the ${theme} theme`, async ({ page }) => {
    await setTheme(page, theme);
    await signIn(page, "mid@example.com");
    for (const path of LEARNER) await checkPage(page, path, theme);
  });

  test(`admin pages pass axe in the ${theme} theme`, async ({ page }) => {
    await setTheme(page, theme);
    await signIn(page, "admin@example.com");
    for (const path of ADMIN) await checkPage(page, path, theme);
  });
}

test("pages reflow at 320 CSS pixels without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of PUBLIC) await expectNoSideScroll(page, path);
  await signIn(page, "mid@example.com");
  for (const path of LEARNER) await expectNoSideScroll(page, path);
});

async function expectNoSideScroll(page: Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} scrolls sideways at 320px`).toBeLessThanOrEqual(1);
}

test("the first Tab stop skips to the main content", async ({ page }) => {
  await signIn(page, "mid@example.com");
  for (const path of ["/today", "/labs", "/account"]) {
    await page.goto(path);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip, `${path}: skip link is the first Tab stop`).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  }
});
