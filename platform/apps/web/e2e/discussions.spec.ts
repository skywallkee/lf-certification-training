import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectAccessible, query, signIn, signOut } from "./helpers";

/** The CKA Course introduction lesson's page, where the seeded lesson discussion lives (scripts/seed-discussions.ts). */
async function lessonPath(): Promise<string> {
  const [row] = await query<{ ref: string }>("select competency_refs[1] as ref from lesson where id = 'cka-course-introduction'");
  const [cert, d, c] = row!.ref.split("/");
  return `/certs/${cert}/domains/${d}/competencies/${c}`;
}

/** Post text, not the same text inside an edit form's textarea. */
function para(scope: Page | Locator, text: string) {
  return scope.locator("p", { hasText: text });
}

/** The lesson's own discussion: other lessons on the same competency page have theirs. */
function discussion(page: Page) {
  return page.locator('section[aria-labelledby="lesson-cka-course-introduction"]').getByRole("region", { name: /^Discussion/ });
}

test("a learner reads a lesson discussion, opens a spoiler, posts a thread, and gets a reply by email", async ({ page }) => {
  const path = await lessonPath();
  await signIn(page, "mid@example.com");
  await page.goto(path);
  const d = discussion(page);
  await expect(d.getByText("Accepted answer")).toBeVisible();
  // The spoiler stays folded until opened.
  await expect(d.getByText("complete -o default -F __start_kubectl k")).toBeHidden();
  await d.getByRole("button", { name: "Show spoiler" }).click();
  await expect(d.getByText("complete -o default -F __start_kubectl k")).toBeVisible();
  await expectAccessible(page, "lesson with discussion");

  await d.getByText("Start a new thread").click();
  await d.getByLabel("Your question or tip").fill("Is `kubectl auth can-i --list` allowed in the exam?");
  await d.getByRole("button", { name: "Post", exact: true }).click();
  await expect(para(d, "Is kubectl auth can-i --list allowed in the exam?")).toBeVisible();
  await signOut(page);

  // Another learner replies and votes; the thread's author follows the discussion and gets one email.
  await query("delete from outbox_email");
  await signIn(page, "new@example.com");
  await page.goto(path);
  const thread = discussion(page).getByRole("listitem").filter({ has: para(page, "Is kubectl auth can-i --list allowed") }).first();
  await thread.getByText("Reply", { exact: true }).click();
  await thread.getByLabel(/^Reply to/).fill("Yes, any kubectl command works there.");
  await thread.getByRole("button", { name: "Post reply" }).click();
  await expect(para(thread, "Yes, any kubectl command works there.")).toBeVisible();
  await thread.getByRole("article", { name: /^Post by Mo/ }).getByRole("button", { name: /helpful/ }).click();
  await expect(thread.getByRole("article", { name: /^Post by Mo/ }).getByRole("button", { name: /remove your vote/ })).toBeVisible();

  await expect
    .poll(async () => (await query<{ subject: string }>("select subject from outbox_email where \"to\" = 'mid@example.com'")).map((r) => r.subject))
    .toContain(`New reply: Lesson: ${await lessonTitle()}`);
  await signOut(page);

  // The author accepts the reply.
  await signIn(page, "mid@example.com");
  await page.goto(path);
  const mine = discussion(page).getByRole("listitem").filter({ has: para(page, "Is kubectl auth can-i --list allowed") }).first();
  await mine.getByRole("button", { name: "Accept as answer" }).click();
  await expect(mine.getByText("Accepted answer")).toBeVisible();
  await expect.poll(async () => (await query("select 1 from outbox_email where \"to\" = 'new@example.com' and subject like 'Your answer was accepted%'")).length).toBe(1);
});

async function lessonTitle(): Promise<string> {
  const [row] = await query<{ title: string }>("select title from lesson where id = 'cka-course-introduction'");
  return row!.title;
}

test("a question's discussion stays folded until the learner answers it", async ({ page }) => {
  await query("delete from answer where question_id = 'sample-cka-001' and user_id = (select id from \"user\" where email = 'new@example.com')");
  await signIn(page, "new@example.com");
  await page.goto("/discuss/question/sample-cka-001");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("This discussion talks about the answer")).toBeVisible();
  await page.getByRole("button", { name: "Show the discussion anyway" }).click();
  await expect(para(page, "Does this depend on whether the cluster has a default StorageClass")).toBeVisible();
  await expectAccessible(page, "question discussion");
});

test("discussions are hidden while an exam-mode mock runs", async ({ page }) => {
  const [u] = await query<{ id: string }>("select id from \"user\" where email = 'golden@example.com'");
  const [q] = await query<{ id: string }>(
    "insert into quiz (user_id, kind, cert_code, question_ids, mock_id, expires_at, draft) values ($1, 'mock', 'KCNA', '{sample-kcna-001}', 'x', now() + interval '1 hour', '{\"answers\":{},\"flags\":[],\"current\":0}') returning id",
    [u!.id],
  );
  try {
    await signIn(page, "golden@example.com");
    await page.goto(await lessonPath());
    await expect(discussion(page).getByText("Discussions are hidden while your mock exam runs")).toBeVisible();
    await expect(page.getByText("Accepted answer")).toHaveCount(0);
    await page.goto("/discuss/question/sample-cka-001");
    await expect(page.getByText("Does this depend on whether")).toHaveCount(0);
  } finally {
    await query("delete from quiz where id = $1", [q!.id]);
  }
});

test("a learner reports a post and an admin hides it from the moderation queue", async ({ page }) => {
  await signIn(page, "new@example.com");
  await page.goto(await lessonPath());
  const tip = discussion(page).getByRole("article").filter({ hasText: "Exam tip" }).first();
  await tip.getByRole("button", { name: "Report" }).click();
  await page.getByLabel("What is wrong").selectOption("wrong");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("A moderator will look at it.")).toBeVisible();
  await page.keyboard.press("Escape");
  await signOut(page);

  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await page.getByRole("link", { name: /^Discussions:/ }).click();
  await expect(page.getByRole("heading", { name: /Reported posts/ })).toBeVisible();
  await expectAccessible(page, "admin discussions");
  const queue = page.getByRole("region", { name: /Reported posts/ });
  const spam = queue.getByRole("listitem").filter({ hasText: "Buy exam dumps" }).first();
  await spam.getByRole("button", { name: /^Hide/ }).click();
  await expect(queue.getByText("Buy exam dumps")).toHaveCount(0);
  await signOut(page);

  await signIn(page, "mid@example.com");
  await page.goto(await lessonPath());
  await expect(para(discussion(page), "Exam tip")).toBeVisible();
  await expect(page.getByText("Buy exam dumps")).toHaveCount(0);
});

test("the link in a discussion email turns discussion emails off", async ({ page }) => {
  const [mail] = await query<{ text: string }>("select text from outbox_email where text like '%Stop all discussion emails%' order by id desc limit 1");
  const link = /Stop all discussion emails: (\S+)/.exec(mail!.text)![1]!;
  const to = new URL(link);
  await page.goto(to.pathname + to.search);
  await expect(page.getByRole("heading", { name: "Stop discussion emails?" })).toBeVisible();
  await page.getByRole("button", { name: "Stop discussion emails" }).click();
  await expect(page.getByRole("heading", { name: "Discussion emails stopped" })).toBeVisible();
  const off = await query<{ n: boolean }>("select notify_discussions as n from profile where notify_discussions = false");
  expect(off.length).toBeGreaterThan(0);
});
