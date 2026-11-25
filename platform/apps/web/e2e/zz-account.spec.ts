import { expect, test } from "@playwright/test";
import { query, signIn, submitSignIn } from "./helpers";

// Runs last (files run in name order with one worker): it deletes a seeded learner.
test("a learner deletes their account and all their data", async ({ page }) => {
  await signIn(page, "golden@example.com");
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL("/?deleted=1");
  const rows = await query("select id from \"user\" where email = $1", ["golden@example.com"]);
  expect(rows).toHaveLength(0);
  await submitSignIn(page, "golden@example.com");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/incorrect|invalid|not match/i).first()).toBeVisible();
});
