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
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Submit and grade" }).click();
  await expect(page).toHaveURL(/\/mocks\/results\//, { timeout: 30_000 });
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
});
