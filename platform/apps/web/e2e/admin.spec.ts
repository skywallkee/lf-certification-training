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
