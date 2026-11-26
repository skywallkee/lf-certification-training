import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible, query, signIn } from "./helpers";

// Same derivation as src/lib/cron-secret.ts, with the e2e server's BETTER_AUTH_SECRET (playwright.config.ts).
const RUN_TOKEN = createHmac("sha256", "e2e-secret-0123456789abcdefghijklmnopqrstuvwxyz").update("reminders-run").digest("base64url");

async function midId(): Promise<string> {
  const [row] = await query<{ id: string }>(`select id from "user" where email = 'mid@example.com'`);
  return row!.id;
}

function isoIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("a learner sees a weekly plan to their booked exam and adds a target date for another cert", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Study plan", level: 1 })).toBeVisible();
  const cka = page.getByRole("region", { name: /^CKA/ });
  await expect(cka.getByText(/\(booked\)/)).toBeVisible();
  await expect(cka.getByRole("heading", { name: /^This week/ })).toBeVisible();
  await expect(cka.getByRole("link", { name: "Clear your review queue, a few minutes a day" })).toBeVisible();
  await expect(cka.getByText(/On track|Tight|Behind|Ready/).first()).toBeVisible();
  await cka.getByText(/^Weeks ahead/).click();
  await expect(cka.getByRole("table", { name: "CKA plan, week by week" })).toBeVisible();
  await expectAccessible(page, "plan page");

  // A target date (not booked) for a cert with no plan yet.
  await page.getByText("Plan another cert").click();
  await page.getByLabel("Cert", { exact: true }).selectOption("CKS");
  await page.getByLabel("Exam date", { exact: true }).fill(isoIn(70));
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page.getByText("CKS target date saved. Your plan is updated.")).toBeVisible();
  const cks = page.getByRole("region", { name: /^CKS/ });
  await expect(cks.getByText(/\(target date\)/)).toBeVisible();
  const rows = await query<{ exam_on: string }>("select exam_on::text from study_target where user_id = $1 and cert_code = 'CKS'", [await midId()]);
  expect(rows[0]?.exam_on).toBe(isoIn(70));

  // Today links to this week's plan for the soonest exam.
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "This week for CKA" })).toBeVisible();

  // Removing the date takes the plan away again.
  await page.goto("/plan");
  await cks.getByText("Change the exam date").click();
  await cks.getByRole("button", { name: "Remove the CKS exam date" }).click();
  await expect(page.getByRole("region", { name: /^CKS/ })).toHaveCount(0);
});

test("a learner turns on reminders, gets the weekly plan once, and unsubscribes from the email link", async ({ page, request }) => {
  const id = await midId();
  await signIn(page, "mid@example.com");
  await page.goto("/account#reminders");
  await page.getByLabel(/This week's study plan/).check();
  await page.getByLabel(/A nudge when I have not studied/).check();
  await page.getByLabel(/Exam countdown/).check();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page.getByText("Reminder settings saved.")).toBeVisible();
  await expectAccessible(page, "account with reminders");

  // Make the weekly email due now: today's weekday in the learner's time zone, from midnight.
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", weekday: "short" }).format(new Date()),
  );
  await query("update profile set remind_day = $2, remind_hour = 0, remind_nudge = false where user_id = $1", [id, weekday]);
  await query("delete from reminder_sent where user_id = $1", [id]);

  expect((await request.post("/api/reminders/run")).status()).toBe(401);
  const run = await request.post("/api/reminders/run", { headers: { authorization: `Bearer ${RUN_TOKEN}` } });
  expect(run.ok()).toBe(true);
  const mails = await query<{ subject: string; text: string }>(
    `select subject, text from outbox_email where "to" = 'mid@example.com' and subject like 'Your study plan for the week of%' order by id desc`,
  );
  expect(mails).toHaveLength(1);
  expect(mails[0]!.text).toContain("CKA exam on");
  // A second run sends nothing new.
  await request.post("/api/reminders/run", { headers: { authorization: `Bearer ${RUN_TOKEN}` } });
  const again = await query(`select id from outbox_email where "to" = 'mid@example.com' and subject like 'Your study plan for the week of%'`);
  expect(again).toHaveLength(1);

  // The link at the bottom stops every reminder, without signing in.
  const link = mails[0]!.text.match(/Stop all study reminders: (\S+)/)?.[1];
  expect(link).toBeTruthy();
  await page.context().clearCookies();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(page.getByRole("heading", { name: "Stop study reminders?" })).toBeVisible();
  await expectAccessible(page, "unsubscribe page");
  await page.getByRole("button", { name: "Stop all reminders" }).click();
  await expect(page.getByRole("heading", { name: "Reminders stopped" })).toBeVisible();
  const [prefs] = await query<{ w: boolean; n: boolean; e: boolean }>("select remind_weekly w, remind_nudge n, remind_exam e from profile where user_id = $1", [id]);
  expect(prefs).toEqual({ w: false, n: false, e: false });

  await page.goto("/unsubscribe?u=bad&t=bad");
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
});

test("the plan page emails this week's plan on request", async ({ page }) => {
  await signIn(page, "mid@example.com");
  await page.goto("/plan");
  await page.getByRole("button", { name: "Email me this week's plan" }).click();
  await expect(page.getByText("Sent to mid@example.com.")).toBeVisible();
});
