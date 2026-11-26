import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, query, signIn, submitSignIn } from "./helpers";

/** The link in the last email of this subject to this address (the e2e server has no SMTP, only the outbox). */
async function lastLink(to: string, subject: RegExp): Promise<string> {
  const rows = await query<{ subject: string; text: string }>("select subject, text from outbox_email where \"to\" = $1 order by id desc", [to]);
  const link = rows.find((r) => subject.test(r.subject))?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link, `an email matching ${subject} to ${to}`).toBeTruthy();
  return link!;
}

/** Signs up a fresh learner and verifies the email; leaves the page on onboarding. */
async function newVerifiedLearner(page: Page, password: string): Promise<string> {
  const email = `auth-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Auth Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await lastLink(email, /verify/i));
  await expect(page).toHaveURL(/\/onboarding/);
  return email;
}

test("a learner resets a forgotten password from the emailed link", async ({ page }) => {
  const email = await newVerifiedLearner(page, "first-password-123");
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expectAccessible(page, "forgot password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await lastLink(email, /reset/i));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await expectAccessible(page, "reset password");
  await page.getByLabel("New password", { exact: true }).fill("second-password-123");
  await page.getByLabel("Repeat the new password").fill("not-the-same-123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The two passwords do not match.")).toBeVisible();
  // The form clears after a refused submit, like any password form.
  await page.getByLabel("New password", { exact: true }).fill("second-password-123");
  await page.getByLabel("Repeat the new password").fill("second-password-123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL("/sign-in?reset=1");
  await expect(page.getByText(/Your password is changed/)).toBeVisible();

  // The old password stops working, the new one works, and the link cannot be used twice.
  await submitSignIn(page, email, "first-password-123");
  await expect(page.getByText("That email and password do not match an account.")).toBeVisible();
  await signIn(page, email, "second-password-123");
  await expect(page).toHaveURL(/\/onboarding/);
});

test("a used or made-up reset link is refused", async ({ page }) => {
  await page.goto("/api/auth/reset-password/not-a-real-token?callbackURL=/reset-password");
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});

test("asking to reset an unknown email answers the same as a known one", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(await query("select id from outbox_email where \"to\" = $1", ["nobody-here@example.com"])).toHaveLength(0);
});

test("a learner changes their password on the account page", async ({ page }) => {
  const email = await newVerifiedLearner(page, "first-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page).toHaveURL("/today?welcome=1");

  await page.goto("/account");
  await page.getByLabel("Current password").fill("wrong-password-123");
  await page.getByLabel("New password", { exact: true }).fill("second-password-123");
  await page.getByLabel("Repeat the new password").fill("second-password-123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password is not right.")).toBeVisible();

  await page.getByLabel("Current password").fill("first-password-123");
  await page.getByLabel("New password", { exact: true }).fill("second-password-123");
  await page.getByLabel("Repeat the new password").fill("second-password-123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, "second-password-123");
  await expect(page).toHaveURL("/today");
});

test("running the setup again changes the goal and the certs held", async ({ page }) => {
  const email = await newVerifiedLearner(page, "first-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/^KCNA/).check();
  await page.getByLabel("Date passed").fill("2026-01-15");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page).toHaveURL("/today?welcome=1");

  await page.goto("/account");
  await page.getByRole("link", { name: "Change my goal" }).click();
  await expect(page.getByRole("heading", { name: "Change your goal", level: 1 })).toBeVisible();
  await page.getByLabel(/One cert/).check();
  await page.getByLabel("Which cert?").selectOption("CKS");
  await page.getByRole("button", { name: "Continue" }).click();
  // The cert passed last time comes pre-ticked with its date; untick it.
  await expect(page.getByLabel(/^KCNA/)).toBeChecked();
  await expect(page.getByLabel("Date passed")).toHaveValue("2026-01-15");
  await page.getByLabel(/^KCNA/).uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("definition").filter({ hasText: "CKS: Certified Kubernetes Security Specialist" })).toBeVisible();
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page).toHaveURL("/today");
  const [prof] = await query<{ focus_cert: string }>("select p.focus_cert from profile p join \"user\" u on u.id = p.user_id where u.email = $1", [email]);
  expect(prof?.focus_cert).toBe("CKS");
  expect(await query("select cert_code from cert_status c join \"user\" u on u.id = c.user_id where u.email = $1", [email])).toHaveLength(0);
});
