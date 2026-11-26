import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

async function noSidewaysScroll(page: Page, urls: string[]) {
  for (const url of urls) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(0);
  }
}

test("search covers labs and mock exams, with type and cert filters", async ({ page }) => {
  await page.goto("/search?q=sample+lab+service+account");
  await expect(page.getByRole("link", { name: "Sample lab: a read-only role for a service account" })).toBeVisible();

  await page.goto("/search?q=mock+exam");
  await page.getByRole("navigation", { name: "Filter by type" }).getByRole("link", { name: /Mock exams/ }).click();
  await expect(page).toHaveURL(/type=mock/);
  await expect(page.getByRole("link", { name: "Sample CKA mock exam (full, 2 hours)" })).toBeVisible();
  await expect(page.getByText(/^Lesson ·/)).toHaveCount(0);

  await page.goto("/search?q=pod");
  await page.getByLabel("Cert").selectOption("CKA");
  await page.locator("#main").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/cert=CKA/);
  await expect(page.getByText(/· KCNA/)).toHaveCount(0);
  await expect(page.getByText(/· CKA/).first()).toBeVisible();
  await expect(page.locator("mark").first()).toBeVisible();
});

test("quick search opens with / or Ctrl+K and goes to a result with the keyboard", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/today");
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search" });
  await expect(box).toBeFocused();
  await box.fill("rbac pod reader");
  await expect(page.getByRole("option").first()).toBeVisible();
  await expectAccessible(page, "quick search");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL("/today");

  await page.goto("/today");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Search" })).toBeFocused();
  await page.getByRole("combobox", { name: "Search" }).fill("storage");
  await page.getByRole("button", { name: "See all results and filters" }).click();
  await expect(page).toHaveURL("/search?q=storage");
});

test("the theme button and the Account setting switch dark mode and remember it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, "mid@example.com");
  await page.goto("/account");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Dark" }).check({ force: true });
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expectAccessible(page, "/account (dark, chosen)");

  // The top bar button cycles Dark -> System; System follows the device (light here).
  await page.getByRole("button", { name: /^Theme: Dark/ }).click();
  await expect(html).not.toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveClass(/dark/);
});

test.describe("phones", () => {
  test.use({ viewport: { width: 375, height: 760 }, hasTouch: true });

  test("the More menu reaches every section, the theme and sign out", async ({ page }) => {
    await signIn(page, "admin@example.com");
    await page.goto("/today");
    const mobileNav = page.getByRole("navigation", { name: "Main (mobile)" });
    await mobileNav.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    for (const name of ["Search", "Saved", "Labs", "Mocks", "Account", "Admin"]) {
      await expect(sheet.getByRole("link", { name })).toBeVisible();
    }
    await expectAccessible(page, "More menu");
    await sheet.getByRole("link", { name: "Labs" }).click();
    await expect(page).toHaveURL("/labs");
    await expect(sheet).toBeHidden();

    await mobileNav.getByRole("button", { name: "More" }).click();
    await sheet.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/");
  });

  test("signed-in pages hold at 320px wide", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await signIn(page, "admin@example.com");
    await noSidewaysScroll(page, ["/certs/cka/readiness", "/search?q=pod", "/labs", "/labs/history", "/mocks", "/mocks/history", "/saved", "/account", "/admin", "/admin/content"]);
  });
});
