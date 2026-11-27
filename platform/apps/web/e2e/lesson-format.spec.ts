import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

/** The CKA Course introduction lesson, a real lesson in the rich format of ADR 0023. */
const INTRO = "/certs/cka/domains/troubleshooting/competencies/troubleshoot-clusters-nodes";

test("a rich lesson shows its diagrams, blocks and video, and the video plays with captions", async ({ page }) => {
  await page.goto(INTRO);
  // Scoped to the lesson's own section: other lessons can share this competency page.
  const lesson = page.locator('section[aria-labelledby="lesson-cka-course-introduction"]');
  await expect(lesson.getByRole("heading", { level: 1, name: /Course introduction: how to study for the CKA/ })).toBeVisible();
  await expect(lesson.getByRole("img", { name: "The five exam domains, placed on a cluster" })).toBeVisible();
  await expect(lesson.getByLabel("Key idea")).toBeVisible();
  await expect(lesson.getByLabel("Example: Set up your shell once")).toBeVisible();
  await expect(lesson.getByLabel("Trick: Study in a loop, not in a line")).toBeVisible();
  // Under the hood starts folded.
  await expect(lesson.getByText("several correct ways to solve a task")).toBeHidden();
  await lesson.getByText("Why this makes the exam fair").click();
  await expect(lesson.getByText("several correct ways to solve a task")).toBeVisible();
  await expectAccessible(page, "rich lesson page");

  const video = lesson.locator('section[aria-label^="Lesson video"]');
  const slider = video.getByRole("slider", { name: "Position in the video" });
  await expect(slider).toHaveAttribute("aria-valuenow", "1");
  await video.getByRole("button", { name: /Watch the lesson/ }).click();
  // No narrator in CI and no browser voice in headless Chromium: the player goes on with captions only.
  await expect(video.getByText("No voice available: captions only.")).toBeVisible({ timeout: 10_000 });
  await expect(slider).toHaveAttribute("aria-valuenow", "2", { timeout: 20_000 });
  await video.getByRole("button", { name: "Pause" }).click();

  await video.getByRole("combobox", { name: "Scene" }).selectOption({ label: "3. What the course covers" });
  await video.getByRole("button", { name: "Transcript" }).click();
  await expect(video.getByRole("list", { name: "Transcript" }).getByRole("button", { name: /^Picture yourself as the administrator/ })).toHaveAttribute("aria-current", "true");
  await expectAccessible(page, "lesson video with transcript");
});

test("the admin drafts a video from a lesson's sections and previews it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content/lesson/cka-course-introduction");
  // The lesson already has a video: remove it (in the editor only, nothing is saved) and draft a new one.
  await page.getByRole("button", { name: "Remove the video" }).click();
  await page.getByRole("button", { name: "Draft from the lesson" }).click();
  await expect(page.getByLabel("Scene 1 narration")).toHaveValue(/What the CKA asks of you/);
  await expect(page.getByLabel("Scene 2 title")).not.toHaveValue("");
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator('section[aria-label^="Lesson video"]').getByRole("button", { name: /Watch the lesson/ })).toBeVisible();
  await expectAccessible(page, "lesson preview with video");
});
