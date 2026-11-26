import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

// The lab controller runs with the fake provider: boots take a second and typing "solve" passes every check.
const MOCK = "sample-cka-mock-half";

test("a learner takes a mock exam in practice mode: prepare, start, check a task, submit and results", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/mocks");
  await expect(page.getByRole("heading", { name: "Mock exams", level: 1 })).toBeVisible();
  await expectAccessible(page, "Mock catalogue");

  await page.goto(`/mocks/${MOCK}`);
  await expectAccessible(page, "Mock detail");
  await page.getByLabel(/Practice mode/).check();
  await page.getByRole("button", { name: "Prepare" }).click();
  await expect(page).toHaveURL(/\/mocks\/attempts\//);

  // The prepare screen: tasks stay hidden and the clock waits for Start.
  await page.getByRole("button", { name: "Start the exam" }).click({ timeout: 30_000 });
  await page.locator("[data-region=terminal][data-state=connected]").waitFor({ timeout: 30_000 });
  await expect(page.getByText("Task 1 of 8")).toBeVisible();
  await expectAccessible(page, "Mock player");

  await page.getByRole("button", { name: "Check this task" }).click();
  await expect(page.getByText("Not yet", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Flag for later" }).click();

  await page.getByTestId("terminal").click();
  await page.keyboard.type("solve");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("terminal")).toContainText("Applied the reference solution");

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("You flagged 1 task for later:")).toBeVisible();
  await page.getByRole("button", { name: "Submit and grade" }).click();
  await expect(page).toHaveURL(/\/mocks\/results\//, { timeout: 30_000 });
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("Pass", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Score per domain" })).toBeVisible();
  await expectAccessible(page, "Mock results");

  await page.goto("/mocks/history");
  await expect(page.getByRole("heading", { name: "Mock exam history", level: 1 })).toBeVisible();
  await expect(page.getByText("By domain, first attempt to latest").first()).toBeVisible();
  await expectAccessible(page, "Mock history");
});

test("exam mode shows no checks, and leaving before Start costs nothing", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto(`/mocks/${MOCK}`);
  await page.getByRole("button", { name: "Prepare" }).click();
  await page.getByRole("button", { name: "Start the exam" }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Leave without starting" }).click();
  await expect(page).toHaveURL(/\/mocks\/results\//, { timeout: 30_000 });
  await expect(page.getByText(/was not started/)).toBeVisible();

  await page.goto(`/mocks/${MOCK}`);
  await expect(page.getByText(/Exam mode · 2 of 2 left this month/)).toBeVisible();
  await page.getByRole("button", { name: "Prepare" }).click();
  await page.getByRole("button", { name: "Start the exam" }).click({ timeout: 30_000 });
  await expect(page.getByText("Task 1 of 8")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check this task" })).toHaveCount(0);
  await expect(page.getByText(/no feedback until you submit/)).toBeVisible();

  // A refresh mid-exam resumes on the same task with the clock still running.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Task 2 of 8")).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText("Task 2 of 8")).toBeVisible();
  await page.locator("[data-region=terminal][data-state=connected]").waitFor({ timeout: 30_000 });

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Submit and grade" }).click();
  await expect(page).toHaveURL(/\/mocks\/results\//, { timeout: 30_000 });
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  // Compared with the practice attempt of the first test, which scored 100%.
  await expect(page.getByText(/from your previous attempt/)).toBeVisible();
});

test("a learner sits a multiple-choice mock: answers save as they go, then submit, score per domain and review", async ({ page }) => {
  await signIn(page, "new@example.com");
  await page.goto("/mocks");
  const card = page.getByRole("listitem").filter({ hasText: "Sample KCNA quick check (10 questions)" });
  await expect(card).toContainText("Multiple choice · 15 min · 10 questions · pass mark 75%");
  await card.getByRole("button", { name: "Start the exam" }).click();
  await expect(page).toHaveURL(/\/mocks\/quiz\//);
  await expect(page.getByRole("heading", { name: "Question 1 of 10" })).toBeVisible();
  await expectAccessible(page, "Multiple-choice mock player");

  // Answer the first question, flag the second, and come back after a reload: both are kept.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/mocks/quiz/"));
  await page.locator("main fieldset input").first().check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Flag for later" }).click();
  await saved;
  await expect(page.getByText("All answers saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 of 10 answered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Question 2, not answered, flagged" })).toBeVisible();

  // The mocks page offers to resume the running attempt instead of starting another.
  await page.goto("/mocks");
  await page.getByRole("listitem").filter({ hasText: "Sample KCNA quick check (10 questions)" }).getByRole("link", { name: "Resume the attempt" }).click();
  await expect(page).toHaveURL(/\/mocks\/quiz\//);

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("9 questions are not answered and will count as wrong.")).toBeVisible();
  await expect(page.getByText("You flagged 1 question for later.")).toBeVisible();
  await page.getByRole("button", { name: "Submit and grade" }).click();
  await expect(page).toHaveURL(/\/mocks\/quiz-results\//, { timeout: 30_000 });
  await expect(page.getByText("Not a pass yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Score per domain" })).toBeVisible();
  await expect(page.getByText(/Question \d+: not answered/).first()).toBeVisible();
  await expectAccessible(page, "Multiple-choice mock results");

  await page.goto("/mocks/history");
  await expect(page.getByRole("link", { name: "Sample KCNA quick check (10 questions)" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Multiple choice" }).first()).toBeVisible();
});

test("the full KCNA mock draws what the sample bank holds and keeps the real exam's pace", async ({ page }) => {
  await signIn(page, "golden@example.com");
  await page.goto("/mocks");
  const card = page.getByRole("listitem").filter({ hasText: "Sample KCNA mock exam (full, 90 minutes)" });
  await expect(card).toContainText(/The bank has \d+ of the 60 questions/);
  await card.getByRole("button", { name: "Start the exam" }).click();
  await expect(page.getByRole("heading", { name: /^Question 1 of \d+$/ })).toBeVisible();
});
