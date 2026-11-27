import { expect, test } from "@playwright/test";
import { expectAccessible, query, signIn, signOut } from "./helpers";

/** The admin content editor: create, validate, publish, edit an ingested item and revert it. */

test("learners cannot open the content editor", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/admin/content");
  await expect(page).toHaveURL("/today");
  const res = await page.request.get("/api/admin/content/lesson/sample-cka-rbac");
  expect(res.status()).toBe(404);
});

test("the admin lists content and filters it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Content: create and edit" }).click();
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Practical mocks \(\d+\)$/ }).click();
  await expect(page.getByRole("link", { name: /CKA mock exam/i }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "lesson" })).toHaveCount(0);
  await expectAccessible(page, "/admin/content");
});

test("the admin creates a question as a draft, fixes its problems and publishes it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content/question/new");
  await expectAccessible(page, "/admin/content/question/new");
  await page.getByRole("textbox", { name: "Id", exact: true }).fill("e2e-authored-question");
  await page.getByRole("button", { name: "Create draft" }).click();
  // Empty stem, no competency and blank options: the server lists each problem.
  const problems = page.getByRole("alert").filter({ hasText: "Not saved" });
  await expect(problems).toContainText("competencies");
  await expect(problems).toContainText("stem");

  await page.getByLabel("Competencies: cert").selectOption("CKA");
  await page.getByLabel("Competencies: add a competency").selectOption({ index: 1 });
  await page.getByLabel("Question (Markdown)").fill("Which command lists Pods in every namespace?");
  await page.getByRole("textbox", { name: "Option a", exact: true }).fill("kubectl get pods -A");
  await page.getByRole("textbox", { name: "Option b", exact: true }).fill("kubectl get pods");
  await page.getByRole("textbox", { name: "Option c", exact: true }).fill("kubectl list pods");
  await page.getByRole("textbox", { name: "Option d", exact: true }).fill("kubectl pods --all");
  await page.getByLabel("Explanation (Markdown)").fill("`-A` is short for `--all-namespaces`.");
  await page.getByLabel("Source title").fill("kubectl reference");
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/admin\/content\/question\/e2e-authored-question\?saved=new/);
  await expect(page.getByText("Created as a draft.")).toBeVisible();
  expect(await query("SELECT published, origin, mock FROM question WHERE id = $1", ["e2e-authored-question"])).toEqual([{ published: false, origin: "app", mock: true }]);
  await expectAccessible(page, "/admin/content/question/[id]");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published: learners can see it now.")).toBeVisible();
  expect(await query("SELECT published FROM question WHERE id = $1", ["e2e-authored-question"])).toEqual([{ published: true }]);
  await expect(page.getByRole("listitem").filter({ hasText: "Published" }).first()).toBeVisible();

  const file = await page.request.get("/api/admin/content/question/e2e-authored-question");
  expect(file.status()).toBe(200);
  expect(await file.text()).toContain("id: e2e-authored-question");
});

test("the admin edits an ingested lesson in the source view, previews it and reverts it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  const [lesson] = await query<{ id: string; title: string }>("SELECT id, title FROM lesson WHERE origin = 'file' AND mock AND body LIKE '%<Callout%' ORDER BY id LIMIT 1");
  await page.goto(`/admin/content/lesson/${lesson!.id}`);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(lesson!.title);

  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("tabpanel").getByRole("complementary").first()).toBeVisible();

  await page.getByRole("tab", { name: "Source (MDX)" }).click();
  const source = page.getByRole("textbox", { name: "Source", exact: true });
  const text = await source.inputValue();
  await source.fill(text.replace(/^title: .*$/m, "title: Edited in the editor") + "\n<script>alert(1)</script>\n");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not saved" })).toContainText("<script> is not allowed");

  await source.fill(text.replace(/^title: .*$/m, "title: Edited in the editor"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited in the editor" })).toBeVisible();
  expect(await query("SELECT origin FROM lesson WHERE id = $1", [lesson!.id])).toEqual([{ origin: "app" }]);

  await page.getByRole("button", { name: "Revert to file version" }).click();
  await expect(page.getByText("Reverted to the file version.")).toBeVisible();
  expect(await query("SELECT title, origin FROM lesson WHERE id = $1", [lesson!.id])).toEqual([{ title: lesson!.title, origin: "file" }]);
});

test("a new lab is checked against the lab rules and stays hidden from learners as a draft", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content/lab/new");
  await page.getByRole("textbox", { name: "Id", exact: true }).fill("e2e-authored-lab");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Draft lab from the editor");
  await page.getByRole("textbox", { name: "Summary", exact: true }).fill("A lab written in the admin editor.");
  await page.getByLabel("Competencies: cert").selectOption("CKA");
  await page.getByLabel("Competencies: add a competency").selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "Weight %" }).fill("90");
  await page.getByLabel("Task title").fill("Run a Pod");
  await page.getByLabel("Task text (Markdown)").fill("Create a Pod named web.");
  await page.getByLabel("Passes when").fill("Pod web exists");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not saved" })).toContainText("task weights must add up to 100, they add up to 90");

  await page.getByRole("spinbutton", { name: "Weight %" }).fill("100");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Created as a draft.")).toBeVisible();
  await expectAccessible(page, "/admin/content/lab/[id]");

  await page.goto("/labs");
  await expect(page.getByText("Draft lab from the editor")).toHaveCount(0);
  await signOut(page);
  await signIn(page, "mid@example.com");
  const res = await page.goto("/labs/e2e-authored-lab");
  expect(res?.status()).toBe(404);
});

test("a new mock exam needs a pass mark, four tasks and a competency per task", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content/mock/new");
  await expect(page.getByText("Weights add up to 100 of 100")).toBeVisible();
  await page.getByRole("textbox", { name: "Id", exact: true }).fill("e2e-authored-mock");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Mock from the editor");
  await page.getByRole("textbox", { name: "Summary", exact: true }).fill("Four tasks.");
  await page.getByLabel("Competencies: cert").first().selectOption("CKA");
  await page.getByLabel("Competencies: add a competency").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create draft" }).click();
  const problems = page.getByRole("alert").filter({ hasText: "Not saved" });
  await expect(problems).toContainText("tasks.0.title");
  await page.getByRole("tab", { name: "Source (YAML)" }).click();
  await expect(page.getByRole("textbox", { name: "Source", exact: true })).toHaveValue(/passPercent: 66/);
  await expectAccessible(page, "/admin/content/mock/new (source)");
});

test("the admin edits a multiple-choice mock: the cert must be a multiple-choice one, and fixed questions must exist", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/content?type=quiz-mock");
  await page.getByRole("link", { name: "Sample KCNA quick check (10 questions)" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/quiz-mock\/sample-kcna-mock-quick/);
  await expect(page.getByText("A fixed list of questions, asked in a new order each time")).toBeVisible();
  await expectAccessible(page, "/admin/content/quiz-mock/[id]");

  await page.getByRole("tab", { name: "Source (YAML)" }).click();
  const source = page.getByRole("textbox", { name: "Source", exact: true });
  await expect(source).toHaveValue(/^format: multiple-choice\n/);
  await source.fill((await source.inputValue()).replace("- sample-kcna-024", "- sample-cka-001"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not saved" })).toContainText('"sample-cka-001" is a CKA question, not KCNA');

  await page.goto("/admin/content/quiz-mock/new");
  await page.getByRole("textbox", { name: "Id", exact: true }).fill("e2e-kcsa-short");
  await page.getByLabel("Cert").selectOption("KCSA");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("KCSA short mock");
  await page.getByLabel("Summary").fill("Five KCSA questions.");
  await page.getByLabel("Questions", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/quiz-mock\/e2e-kcsa-short\?saved=new/);
  expect(await query("SELECT published, origin, question_count FROM quiz_mock WHERE id = $1", ["e2e-kcsa-short"])).toEqual([{ published: false, origin: "app", question_count: 5 }]);
});
