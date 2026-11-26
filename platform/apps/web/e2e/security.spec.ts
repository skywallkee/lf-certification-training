import { expect, test } from "@playwright/test";
import { signIn, submitSignIn } from "./helpers";

test("pages send a nonce-based Content-Security-Policy that blocks nothing the app needs", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto("/sign-in");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  await signIn(page, "mid@example.com");
  for (const path of ["/today", "/certs/kcna", "/practice", "/labs", "/account"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }
  // The theme toggle is client-side JavaScript: it only works when the nonce reached React's scripts.
  const toggle = page.getByRole("button", { name: /^Theme:/ }).first();
  const before = await toggle.getAttribute("aria-label");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("aria-label", before ?? "");
  expect(violations).toEqual([]);
});

test("sign-in stops answering after 10 wrong passwords for one email", async ({ page }) => {
  const email = `locked-${Date.now()}@example.com`;
  for (let i = 0; i < 10; i++) {
    await submitSignIn(page, email, "wrong-password-123");
    await expect(page.getByText("That email and password do not match an account.")).toBeVisible();
  }
  await submitSignIn(page, email, "wrong-password-123");
  await expect(page.getByText(/Too many attempts/)).toBeVisible();
});
