import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

// The lab controller runs with the fake provider: boots take a second and typing "solve" passes every check.
const LAB = "sample-cka-rbac-pod-reader";

test("a learner runs a lab: boot, terminal, hint, check, extend, finish and results", async ({
  page,
}) => {
  await signIn(page, "mid@example.com");
  await page.goto("/labs");
  await expect(
    page.getByRole("heading", { name: "Labs", level: 1 }),
  ).toBeVisible();
  await expectAccessible(page, "Lab catalogue");

  await page.goto(`/labs/${LAB}`);
  await expectAccessible(page, "Lab detail");
  await page.getByRole("button", { name: "Start lab" }).click();
  await expect(page).toHaveURL(/\/labs\/sessions\//);

  const terminal = page.locator("[data-region=terminal][data-state=connected]");
  await terminal.waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("terminal")).toContainText("Fake lab terminal");
  await expectAccessible(page, "Lab player");

  await page.getByRole("button", { name: "Check my work" }).click();
  await expect(page.getByText("0 of 4 checks passed")).toBeVisible();

  await page
    .getByRole("button", { name: /Show hint 1 of/ })
    .first()
    .click();
  await expect(page.getByText("Hint 1:").first()).toBeVisible();

  // One exercise at a time: move on, flag it, come back.
  await expect(page.getByText("Exercise 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Exercise 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Flag for later" }).click();
  await expect(
    page.getByRole("button", { name: "Flag for later" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /^Exercise 2: .*flagged$/ }),
  ).toBeVisible();
  // A refresh resumes where the learner was: same exercise, same flag, terminal back.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText("Exercise 2 of 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Flag for later" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-region=terminal][data-state=connected]").waitFor({ timeout: 30_000 });
  await expect(page.getByText("0 of 4 checks passed")).toBeVisible();
  await expect(page).toHaveTitle(/left · Lab/);

  // The banner on every other page leads back to the running lab.
  await page.goto("/today");
  await expect(page.getByText("Your lab is running:")).toBeVisible();
  await page.getByRole("link", { name: "Back to the lab" }).click();
  await expect(page.getByText("Exercise 2 of 3")).toBeVisible();

  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByText("Exercise 1 of 3")).toBeVisible();

  // The docs tab shows the official docs through the controller's docs viewer.
  await page.getByRole("tab", { name: "Documentation" }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /^http:\/\/kubernetes\.io\.localhost:\d+\/docs\//,
  );
  await page.getByRole("tab", { name: "Exercises" }).click();

  await page.getByTestId("terminal").click();
  await page.keyboard.type("solve");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("terminal")).toContainText(
    "Applied the reference solution",
  );
  await page.getByRole("button", { name: "Check my work" }).click();
  await expect(page.getByText("4 of 4 checks passed")).toBeVisible();

  await page.getByRole("button", { name: "Extend 15 min" }).click();
  await expect(page.getByRole("button", { name: "Extend 15 min" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Finish and delete cluster" }).click();
  await expect(page).toHaveURL(/\/labs\/history\//, { timeout: 30_000 });
  await expect(page.getByText("100%")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reference solution" }),
  ).toBeVisible();
  await expectAccessible(page, "Lab results");

  await page.goto("/labs/history");
  await expectAccessible(page, "Lab history");
});

test("an admin sees live lab sessions and can kill one", async ({
  browser,
}) => {
  const learner = await (await browser.newContext()).newPage();
  await signIn(learner, "golden@example.com");
  await learner.goto(`/labs/${LAB}`);
  await learner.getByRole("button", { name: "Start lab" }).click();
  await learner
    .locator("[data-region=terminal][data-state=connected]")
    .waitFor({ timeout: 30_000 });

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "admin@example.com");
  await admin.goto("/admin/labs");
  await expectAccessible(admin, "Admin labs");
  await admin
    .getByRole("button", { name: "Kill the lab of golden@example.com" })
    .click();
  await expect(
    admin.getByRole("button", { name: "Kill the lab of golden@example.com" }),
  ).toHaveCount(0);

  // The player notices the session ended and moves to its results page.
  await expect(learner).toHaveURL(/\/labs\/history\//, { timeout: 30_000 });
  await expect(learner.getByText("Ended by an admin")).toBeVisible();
});
