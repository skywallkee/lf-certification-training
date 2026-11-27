import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";

const SERVICES = "/certs/cka/domains/servicing-networking/competencies/clusterip-nodeport-loadbalancer-service-types";

test("the rich template lesson shows its diagrams, blocks and video, and the video plays with captions", async ({ page }) => {
  await page.goto(SERVICES);
  // Scoped to the sample lesson: real lessons share this competency page.
  const lesson = page.locator('section[aria-labelledby="lesson-sample-cka-services"]');
  await expect(lesson.getByRole("heading", { level: 1, name: /Services: one stable address/ })).toBeVisible();
  await expect(lesson.getByRole("img", { name: "How a client reaches the Pods behind a Service" })).toBeVisible();
  await expect(lesson.getByLabel("Key idea")).toBeVisible();
  await expect(lesson.getByLabel("Example: Expose a Deployment and prove it works")).toBeVisible();
  await expect(lesson.getByLabel("Trick: Debug from the endpoints inward")).toBeVisible();
  // Under the hood starts folded.
  await expect(lesson.getByText("The choice of backend is made")).toBeHidden();
  await lesson.getByText("What happens to each connection").click();
  await expect(lesson.getByText("The choice of backend is made")).toBeVisible();
  await expectAccessible(page, "rich lesson page");

  const video = lesson.locator('section[aria-label^="Lesson video"]');
  const slider = video.getByRole("slider", { name: "Position in the video" });
  await expect(slider).toHaveAttribute("aria-valuenow", "1");
  await video.getByRole("button", { name: /Watch the lesson/ }).click();
  // No narrator in CI and no browser voice in headless Chromium: the player goes on with captions only.
  await expect(video.getByText("No voice available: captions only.")).toBeVisible({ timeout: 10_000 });
  await expect(slider).toHaveAttribute("aria-valuenow", "2", { timeout: 20_000 });
  await video.getByRole("button", { name: "Pause" }).click();

  await video.getByRole("combobox", { name: "Scene" }).selectOption({ label: "3. What a Service is" });
  await video.getByRole("button", { name: "Transcript" }).click();
  await expect(video.getByRole("list", { name: "Transcript" }).getByRole("button", { name: /^Here is a client Pod/ })).toHaveAttribute("aria-current", "true");
  await expectAccessible(page, "lesson video with transcript");
});

test("the admin drafts a video from a lesson's sections and previews it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content/lesson/sample-cka-rbac");
  await page.getByRole("button", { name: "Draft from the lesson" }).click();
  await expect(page.getByLabel("Scene 1 narration")).toHaveValue(/least access/);
  await expect(page.getByLabel("Scene 2 title")).not.toHaveValue("");
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator('section[aria-label^="Lesson video"]').getByRole("button", { name: /Watch the lesson/ })).toBeVisible();
  await expectAccessible(page, "lesson preview with video");
});
