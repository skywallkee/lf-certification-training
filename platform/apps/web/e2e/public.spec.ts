import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test("visitors can browse certs and read a lesson without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Study for all 17 Golden Kubestronaut certs");
  await page.getByRole("link", { name: "Browse the certs" }).click();
  await expect(page.getByRole("heading", { name: "Certifications", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /^CKA Certified Kubernetes Administrator/ }).click();
  await expect(page.getByRole("heading", { name: "Certified Kubernetes Administrator" })).toBeVisible();
  await expect(page.getByText("Sample content").first()).toBeVisible();

  await page.getByText("Troubleshooting", { exact: true }).click();
  await page.getByRole("link", { name: "Troubleshoot clusters and nodes" }).click();
  await expect(page.getByRole("heading", { name: "Course introduction: how to study for the CKA", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "The five exam domains, placed on a cluster" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in to practise" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test("lesson code blocks are highlighted and can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const url = "/certs/cka/domains/troubleshooting/competencies/troubleshoot-clusters-nodes";
  await page.goto(url);
  const block = page.locator('section[aria-labelledby="lesson-cka-course-introduction"]').locator(".code-block").filter({ hasText: "kind.x-k8s.io" }).first();
  await expect(block.locator("code.language-yaml .hljs-attr").first()).toHaveText("kind:");
  await block.getByRole("button", { name: "Copy code" }).click();
  await expect(block.getByRole("button", { name: "Copied code" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("kind: Cluster");
  await expectAccessible(page, url);
});

test("a competency without a lesson says the lesson is coming", async ({ page }) => {
  await page.goto("/certs/cka/domains/storage/competencies/configure-volume-types-access-modes");
  await expect(page.getByRole("heading", { name: "Lesson coming" })).toBeVisible();
  await expect(page.getByText("2 questions tagged with this competency.")).toBeVisible();
});

test("quizzes and Today need sign-in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL("/sign-in?next=%2Ftoday");
  await page.goto("/practice");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fpractice/);
});

test("search finds lessons, competencies and questions", async ({ page }) => {
  await page.goto("/search?q=introduction");
  await expect(page.getByRole("link", { name: "Course introduction: how to study for the CKA" })).toBeVisible();
  await page.goto("/search?q=coredns");
  await expect(page.getByRole("link", { name: "Understand and use CoreDNS" })).toBeVisible();
  await expect(page.getByText(/result/).first()).toBeVisible();
});

test("public pages pass the accessibility checks", async ({ page }) => {
  for (const url of ["/", "/certs", "/certs/cka", "/certs/ckne/domains/service-networking-dns/competencies/customizing-coredns-services", "/sign-in", "/sign-up", "/search?q=storage"]) {
    await page.goto(url);
    await expectAccessible(page, url);
  }
});

test("study screens hold at 320px wide without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const url of ["/", "/certs", "/certs/cka", "/certs/cka/domains/storage/competencies/implement-storage-classes-dynamic-volume"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
