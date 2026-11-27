import { expect, test } from "@playwright/test";
import { expectAccessible, query, signIn, submitSignIn } from "./helpers";

test("a new learner signs up, verifies their email, onboards and lands on Today", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("E2E Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // No mail provider in Phase 1: read the link from the outbox table.
  const [mail] = await query<{ text: string }>("select text from outbox_email where \"to\" = $1 order by id desc limit 1", [email]);
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);

  // Guided setup: goal, certs held, study time, then a summary with the first focus cert.
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "What are you aiming for?" })).toBeVisible();
  await expectAccessible(page, "onboarding step 1");
  await page.getByLabel(/The Kubestronaut 5/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Which certs do you already hold?" })).toBeFocused();
  await page.getByLabel(/^KCNA/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the date you passed KCNA, roughly is fine.")).toBeVisible();
  await page.getByLabel("Date passed").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Hours a week").selectOption("6");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your plan" })).toBeVisible();
  await expect(page.getByText("KCSA: Kubernetes and Cloud Native Security Associate")).toBeVisible();
  await expectAccessible(page, "onboarding summary");
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page).toHaveURL("/today?welcome=1");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are set up: first up is KCSA" })).toBeVisible();
  const [prof] = await query<{ focus_cert: string; hours_per_week: number }>(
    "select p.focus_cert, p.hours_per_week from profile p join \"user\" u on u.id = p.user_id where u.email = $1",
    [email],
  );
  expect(prof).toEqual({ focus_cert: "KCSA", hours_per_week: 6 });
});

test("signing in before verifying the email is refused", async ({ page }) => {
  const email = `unverified-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Unverified");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await submitSignIn(page, email, "a-long-password-1");
  await expect(page).toHaveURL(/\/verify-email\?email=/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("the mid learner takes a practice quiz with the keyboard and sees results", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await expect(page).toHaveURL("/today");
  await page.goto("/practice?cert=KCNA");
  await page.getByLabel("Questions", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page).toHaveURL(/\/quiz\//);

  for (let i = 0; i < 5; i++) {
    await expect(page.getByRole("heading", { name: `Question ${i + 1} of 5`, level: 1 })).toBeVisible();
    if (i === 0) await expectAccessible(page, "quiz question");
    await page.keyboard.press("1");
    const multi = await page.getByText("Choose all that apply.").isVisible();
    if (multi) await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    // Instant feedback stays on screen until the learner moves on.
    await expect(page.getByText(/^(Correct\.|Not quite\. Here is why\.)$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Next question|See results/ })).toBeFocused();
    if (i === 0) await expectAccessible(page, "quiz feedback");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: /of 5 right/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your answers" })).toBeVisible();
  await expectAccessible(page, "quiz results");
});

test("the mid learner runs a review session from the queue", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Due today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your queue" })).toBeVisible();
  // The mid learner has missed CKA and CKNE questions due, so there is a session per cert too.
  await page.getByRole("button", { name: /^Review CKNE, \d+ questions? due$/ }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await expect(page.getByText(/^CKNE review/)).toBeVisible();
  await page.goto("/review");
  await page.getByRole("button", { name: "Review all certs" }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await expect(page.getByRole("button", { name: /Check answer/ })).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
});

test("marking a lesson done, saving it and writing a note show up on Saved", async ({ page }) => {
  await signIn(page, "new@example.com");
  await page.goto("/certs/kcna/domains/kubernetes-fundamentals/competencies/kubernetes-core-concepts");
  const markDone = page.getByRole("button", { name: "Mark as done" });
  if (await markDone.isVisible()) {
    await markDone.click();
    await expect(page.getByRole("button", { name: /Done · mark as not done/ })).toBeVisible();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await page.getByLabel("Your private note").fill("Remember: a Deployment manages ReplicaSets.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();

  await page.goto("/saved");
  await expect(page.getByText("Remember: a Deployment manages ReplicaSets.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pods, Deployments and Services in one picture/ }).first()).toBeVisible();
});

test("a learner books an exam and then marks it passed", async ({ page }) => {
  await signIn(page, "new@example.com");
  await page.goto("/certs/kcna");
  await page.getByLabel("Exam booked").check();
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Exam date").fill(soon);
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Booked").first()).toBeVisible();

  await page.getByLabel("Passed").check();
  await page.getByLabel("Date passed").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Passed").first()).toBeVisible();
});

test("a passed or expiring cert can be the focus, for renewal or a refresh", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/certs");
  // KCNA is expiring soon for the mid learner.
  await page.getByRole("button", { name: "Set as focus cert: KCNA", exact: true }).click();
  await expect(page.getByRole("link", { name: "Focus: KCNA" })).toBeVisible();
  await page.goto("/plan");
  await expect(page.getByRole("region", { name: "KCNA Kubernetes and Cloud Native Associate" })).toBeVisible();
  // Put the mid learner back on CKA for the tests that follow.
  await page.goto("/certs");
  await page.getByRole("button", { name: "Set as focus cert: CKA", exact: true }).click();
  await expect(page.getByRole("link", { name: "Focus: CKA" })).toBeVisible();
});

test("signed-in pages pass the accessibility checks in light and dark", async ({ page }) => {
  await signIn(page, "mid@example.com");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const url of ["/today", "/certs", "/progress", "/certs/cka", "/certs/cka/readiness", "/practice", "/review", "/saved", "/account"]) {
      await page.goto(url);
      await expectAccessible(page, `${url} (${theme})`);
    }
  }
});

test("Today holds at 320px wide without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page, "mid@example.com");
  for (const url of ["/today", "/certs", "/progress", "/review"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});

test("the progress dashboard shows readiness per cert from questions, lessons, labs and mock exams", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.getByRole("link", { name: "Progress" }).first().click();
  await expect(page).toHaveURL("/progress");
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();

  const cka = page.getByRole("region", { name: /^CKA / });
  await expect(cka.getByText("Booked")).toBeVisible();
  await expect(cka.getByRole("img", { name: /Readiness \d+ percent/ })).toBeVisible();
  await expect(cka.getByText(/lab tasks? and \d+ mock exam tasks?/)).toBeVisible();
  // Lessons read: the total grows with every real CKA lesson.
  await expect(cka.getByText(/^3 of \d+$/)).toBeVisible();
  await expect(cka.getByText(/1 of 2 solved/)).toBeVisible();
  await expect(cka.getByText(/^Best \d+%$/)).toBeVisible();
  await expect(cka.getByRole("heading", { name: "Before you book" })).toBeVisible();
  await expect(cka.getByText(/Pass a timed mock exam/)).toBeVisible();

  // CKNE was only started: not enough evidence for a score yet.
  const ckne = page.getByRole("region", { name: /^CKNE / });
  await expect(ckne.getByText(/Not enough answers yet to estimate readiness/)).toBeVisible();

  await expect(page.getByRole("region", { name: "Passed" }).getByRole("link", { name: "CKAD" })).toBeVisible();
  await expectAccessible(page, "Progress dashboard");

  await cka.getByRole("link", { name: "Readiness by domain" }).click();
  await expect(page.getByRole("heading", { name: "CKA readiness", level: 1 })).toBeVisible();
  await expect(page.getByText(/lesson read|lessons read/).first()).toBeVisible();
});
