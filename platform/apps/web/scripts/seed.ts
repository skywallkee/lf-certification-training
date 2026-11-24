import { randomUUID } from "node:crypto";
import { question } from "@lfct/curriculum/db";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema.ts";
import { addDays, addMonths, todayIn } from "../src/lib/dates.ts";
import { nextReviewState, type ReviewState } from "../src/lib/review.ts";

/**
 * Seeds the sample learners described in the spec, one per stage, so Today, Path and readiness can be
 * checked at each: a new user, a mid-path user (3 passed, 1 booked, 1 expiring) and a Golden user, plus an
 * admin. Dates are relative to today so the states stay true. Development and test databases only.
 * Run after migrations and the content ingest: pnpm --filter @lfct/web db:seed
 */
export const SAMPLE_PASSWORD = "sample-password-123";
export const SAMPLE_USERS = {
  new: { email: "new@example.com", name: "Nadia (new learner)" },
  mid: { email: "mid@example.com", name: "Mo (mid-path learner)" },
  golden: { email: "golden@example.com", name: "Gita (Golden learner)" },
  admin: { email: "admin@example.com", name: "Ada (admin)" },
} as const;

const GOLDEN = ["KCNA", "KCSA", "CKA", "CKAD", "CKS", "LFCS", "CKNE", "PCA", "OTCA", "CGOA", "CAPA", "ICA", "CCA", "KCA", "CBA", "CNPA", "CNPE"];

/** Accuracy per CKA domain for the mid-path learner; Storage is the weak one, as in the mockups. */
const MID_ACCURACY: Record<string, number> = {
  troubleshooting: 0.6,
  "cluster-architecture-installation-configuration": 0.72,
  "servicing-networking": 0.66,
  "workloads-scheduling": 0.75,
  storage: 0.4,
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seed(databaseUrl: string, opts: { today?: string } = {}): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const db = drizzle(pool, { schema });
  const today = opts.today ?? todayIn("UTC");
  try {
    const emails = Object.values(SAMPLE_USERS).map((u) => u.email);
    await db.delete(schema.user).where(inArray(schema.user.email, emails));
    const hash = await hashPassword(SAMPLE_PASSWORD);
    const ids: Record<keyof typeof SAMPLE_USERS, string> = { new: randomUUID(), mid: randomUUID(), golden: randomUUID(), admin: randomUUID() };
    for (const [key, u] of Object.entries(SAMPLE_USERS) as [keyof typeof SAMPLE_USERS, (typeof SAMPLE_USERS)[keyof typeof SAMPLE_USERS]][]) {
      await db.insert(schema.user).values({ id: ids[key], name: u.name, email: u.email, emailVerified: true, role: key === "admin" ? "admin" : "user" });
      await db.insert(schema.account).values({ id: randomUUID(), accountId: ids[key], providerId: "credential", userId: ids[key], password: hash, updatedAt: new Date() });
    }
    const now = new Date();

    // Admin: onboarded, no study yet.
    await db.insert(schema.profile).values({ userId: ids.admin, timeZone: "UTC", goal: "golden", hoursPerWeek: 2, focusCert: "KCNA", onboardedAt: now });

    // Golden: all 17 passed; KCSA passed long ago so it is expiring.
    await db.insert(schema.profile).values({ userId: ids.golden, timeZone: "Europe/Bucharest", goal: "golden", hoursPerWeek: 3, focusCert: null, onboardedAt: now });
    await db.insert(schema.certStatus).values(
      GOLDEN.map((cert, i) => ({
        userId: ids.golden,
        certCode: cert,
        state: "passed" as const,
        passedOn: cert === "KCSA" ? addDays(addMonths(today, -24), 60) : addDays(today, -30 - i * 20),
      })),
    );

    // Mid-path: KCNA (expiring), KCSA and CKAD passed; CKA booked; focus CKA.
    await db.insert(schema.profile).values({ userId: ids.mid, timeZone: "Europe/Bucharest", goal: "golden", hoursPerWeek: 4, focusCert: "CKA", onboardedAt: now });
    await db.insert(schema.certStatus).values([
      { userId: ids.mid, certCode: "KCNA", state: "passed", passedOn: addDays(addMonths(today, -24), 40) },
      { userId: ids.mid, certCode: "KCSA", state: "passed", passedOn: addDays(today, -167) },
      { userId: ids.mid, certCode: "CKAD", state: "passed", passedOn: addDays(today, -83) },
      { userId: ids.mid, certCode: "CKA", state: "booked", bookedFor: addDays(today, 55) },
    ]);
    await db.insert(schema.lessonProgress).values([
      { userId: ids.mid, lessonId: "sample-cka-rolling-updates", completedAt: new Date(now.getTime() - 3 * 86_400_000) },
      { userId: ids.mid, lessonId: "sample-cka-container-logs", completedAt: new Date(now.getTime() - 2 * 86_400_000) },
      { userId: ids.mid, lessonId: "sample-cka-rbac", completedAt: new Date(now.getTime() - 86_400_000) },
    ]);

    const ckaQuestions = await db
      .select({ id: question.id, refs: question.competencyRefs, options: question.options, knownIssue: question.knownIssue })
      .from(question)
      .where(eq(question.certCode, "CKA"));
    const usable = ckaQuestions.filter((q) => !q.knownIssue);
    if (usable.length === 0) throw new Error("No CKA questions found. Run pnpm curriculum:ingest first.");
    const rand = rng(42);
    const review = new Map<string, ReviewState>();
    // Ten days of practice ending yesterday, so the learner has a streak and a due review queue.
    for (let day = 10; day >= 1; day--) {
      const date = addDays(today, -day);
      const quizId = randomUUID();
      const at = new Date(`${date}T18:00:00Z`);
      const picked = [...usable].sort(() => rand() - 0.5).slice(0, 7);
      await db.insert(schema.quiz).values({ id: quizId, userId: ids.mid, kind: "practice", feedback: "instant", certCode: "CKA", questionIds: picked.map((q) => q.id), createdAt: at, finishedAt: at });
      for (const [i, q] of picked.entries()) {
        const domainKey = q.refs[0]!.split("/")[1]!;
        const correct = rand() < (MID_ACCURACY[domainKey] ?? 0.6);
        const right = q.options.filter((o) => o.correct).map((o) => o.id);
        const wrong = q.options.find((o) => !o.correct)?.id ?? "a";
        await db.insert(schema.answer).values({
          userId: ids.mid,
          quizId,
          questionId: q.id,
          certCode: "CKA",
          selected: correct ? right : [wrong],
          correct,
          answeredAt: new Date(at.getTime() + i * 60_000),
        });
        const next = nextReviewState(review.get(q.id), correct, date);
        if (next === null) review.delete(q.id);
        else if (next) review.set(q.id, next);
      }
    }
    if (review.size > 0) {
      await db.insert(schema.reviewItem).values([...review].map(([questionId, s]) => ({ userId: ids.mid, questionId, ...s })));
    }
    console.log(`Seeded ${Object.keys(SAMPLE_USERS).length} sample learners (password: ${SAMPLE_PASSWORD}).`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to seed sample learners with NODE_ENV=production.");
    process.exit(1);
  }
  await seed(url);
}
