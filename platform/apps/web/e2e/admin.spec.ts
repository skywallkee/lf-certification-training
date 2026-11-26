import { expect, test } from "@playwright/test";
import { expectAccessible, signIn, signOut, submitSignIn } from "./helpers";

test("the admin sees ingest runs, the flag queue and coverage", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Content ingest" })).toBeVisible();
  await expect(page.getByText("Included").first()).toBeVisible();
  await expect(page.getByText("Known issue in content").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coverage by cert" })).toBeVisible();
  await expectAccessible(page, "/admin");
});

test("learners are sent from the admin page back to Today", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/admin");
  await expect(page).toHaveURL("/today");
});

test("a disabled learner cannot sign in, and can again once enabled", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Disable new@example.com" }).click();
  await expect(page.getByRole("button", { name: "Enable new@example.com" })).toBeVisible();
  await signOut(page);

  await submitSignIn(page, "new@example.com");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("This account is disabled. Contact the site admin.")).toBeVisible();

  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Enable new@example.com" }).click();
  await expect(page.getByRole("button", { name: "Disable new@example.com" })).toBeVisible();
});

test("the admin sees analytics for the sample cohort, and can change the time range", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Analytics: learners and usage" }).click();
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active learners per week" })).toBeVisible();
  // The seeded cohort makes CKA Storage the weakest domain.
  const domains = page.getByRole("region", { name: "Weakest domains" });
  await expect(domains.getByRole("row").nth(1)).toContainText("Storage");
  await expect(page.getByRole("region", { name: "Most missed questions" }).getByRole("row")).not.toHaveCount(0);
  await expect(page.getByRole("region", { name: "Labs", exact: true }).getByRole("cell", { name: /three clusters/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mock exams" }).getByRole("row")).not.toHaveCount(0);
  await page.getByRole("link", { name: "4 weeks" }).click();
  await expect(page).toHaveURL(/weeks=4/);
  await expect(page.getByRole("link", { name: "4 weeks" })).toHaveAttribute("aria-current", "page");
  await expectAccessible(page, "/admin/analytics");
});

test("learners cannot open admin analytics", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/admin/analytics");
  await expect(page).toHaveURL("/today");
});
