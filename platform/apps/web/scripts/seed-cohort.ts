import { randomUUID } from "node:crypto";
import { lab, lesson, question } from "@lfct/curriculum/db";
import { eq, like } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.ts";
import { addDays } from "../src/lib/dates.ts";

/**
 * A cohort of sample learners for the admin analytics page: 30 accounts at @cohort.example.com who signed up over
 * the last six months and studied, ran labs and sat mock exams at different paces, some of them stopping along the
 * way. The numbers are made up but shaped like a real cohort: sign-ups grow, CKA Storage and Troubleshooting and
 * KCNA Container orchestration are the weak domains, two questions are missed by most, a few labs fail to boot or
 * get killed, and the three-cluster labs cost the most cluster minutes. Nobody can sign in as them (no password).
 *
 * Deterministic for a given `today`. Every row hangs off the cohort users, so re-seeding deletes and recreates them.
 * Development and test databases only.
 */
export const COHORT_DOMAIN = "cohort.example.com";
export const COHORT_SIZE = 30;

type Db = NodePgDatabase<typeof schema>;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** How often learners get each domain right before practice helps; unlisted domains sit at 0.72. */
const DOMAIN_ACCURACY: Record<string, number> = {
  "cka/storage": 0.46,
  "cka/troubleshooting": 0.52,
  "cka/servicing-networking": 0.66,
  "cka/workloads-scheduling": 0.76,
  "cka/cluster-architecture-installation-configuration": 0.7,
  "kcna/container-orchestration": 0.55,
  "kcna/kubernetes-fundamentals": 0.8,
  "kcna/cloud-native-architecture": 0.74,
  "ckne/network-security-policy": 0.58,
  "ckne/core-infrastructure-cni": 0.64,
  "ckne/service-networking-dns": 0.7,
  "ckad/application-design-build": 0.68,
};

const PACE = [
  { name: "steady", daysPerWeek: 4, labsPerWeek: 0.9, share: 0.3 },
  { name: "casual", daysPerWeek: 2, labsPerWeek: 0.35, share: 0.45 },
  { name: "light", daysPerWeek: 0.7, labsPerWeek: 0.1, share: 0.25 },
] as const;

const FOCUS = ["CKA", "KCNA", "CKA", "CKNE", "KCNA", "CKA", "CKAD"] as const;
const NAMES = ["Ana", "Ben", "Chen", "Dara", "Elif", "Femi", "Goran", "Hana", "Ivo", "Jun", "Kai", "Lena", "Mateo", "Nia", "Omar", "Pia", "Quinn", "Ravi", "Sara", "Tomas", "Uma", "Vlad", "Wen", "Xenia", "Yusuf", "Zoe", "Aria", "Bogdan", "Carmen", "Dmitri"];

function domainKey(ref: string | undefined): string {
  const [cert, domain] = (ref ?? "").split("/");
  return `${cert}/${domain}`;
}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

export async function seedCohort(db: Db, today: string): Promise<number> {
  await db.delete(schema.user).where(like(schema.user.email, `%@${COHORT_DOMAIN}`));
  const rand = rng(2026);
  const questions = (await db.select({ id: question.id, certCode: question.certCode, refs: question.competencyRefs, options: question.options, knownIssue: question.knownIssue, published: question.published }).from(question)).filter(
    (q) => !q.knownIssue && q.published,
  );
  const lessons = await db.select({ id: lesson.id, certCode: lesson.certCode }).from(lesson).where(eq(lesson.published, true));
  const labs = (await db.select().from(lab).where(eq(lab.published, true))).sort((a, b) => a.id.localeCompare(b.id));
  const byCert = (code: string) => questions.filter((q) => q.certCode === code).sort((a, b) => a.id.localeCompare(b.id));
  // The first question of each of the two weakest domains is the one nearly everybody misses.
  const hard = new Set(["cka/storage", "kcna/container-orchestration"].map((d) => questions.filter((q) => domainKey(q.refs[0]) === d).sort((a, b) => a.id.localeCompare(b.id))[0]?.id).filter(Boolean));

  const users: (typeof schema.user.$inferInsert)[] = [];
  const profiles: (typeof schema.profile.$inferInsert)[] = [];
  const quizzes: (typeof schema.quiz.$inferInsert)[] = [];
  const answers: (typeof schema.answer.$inferInsert)[] = [];
  const lessonRows: (typeof schema.lessonProgress.$inferInsert)[] = [];
  const sessions: (typeof schema.labSession.$inferInsert)[] = [];
  const checkRuns: (typeof schema.labCheckRun.$inferInsert)[] = [];

  for (let n = 0; n < COHORT_SIZE; n++) {
    const id = randomUUID();
    const r = rand();
    const pace = r < PACE[0].share ? PACE[0] : r < PACE[0].share + PACE[1].share ? PACE[1] : PACE[2];
    const focus = FOCUS[n % FOCUS.length]!;
    // Sign-ups grow: more learners joined recently. Day offsets from 182 days ago to 3 days ago.
    const joinedAgo = Math.round(3 + 179 * (1 - Math.sqrt((n + rand() * 0.9) / COHORT_SIZE)));
    const joined = addDays(today, -joinedAgo);
    // About a quarter stop studying after a while.
    const stopsAgo = rand() < 0.25 ? Math.max(1, Math.round(joinedAgo * rand() * 0.6)) : 0;
    const skill = (rand() - 0.5) * 0.16;
    const email = `learner${String(n + 1).padStart(2, "0")}@${COHORT_DOMAIN}`;
    const joinedAt = new Date(`${joined}T09:00:00Z`);
    users.push({ id, name: `${NAMES[n]} (sample cohort)`, email, emailVerified: true, role: "user", createdAt: joinedAt, updatedAt: joinedAt });
    profiles.push({ userId: id, timeZone: "UTC", goal: focus === "KCNA" ? "kubestronaut" : "golden", hoursPerWeek: Math.round(pace.daysPerWeek * 1.5) || 1, focusCert: focus, onboardedAt: joinedAt });

    const pool = byCert(focus === "CKAD" ? "CKA" : focus);
    const second = byCert(focus === "KCNA" ? "CKA" : "KCNA");
    const myLessons = lessons.filter((l) => l.certCode === focus).map((l) => l.id);
    const myLabs = labs.filter((l) => l.kind === "lab" && (l.certCode === focus || (focus === "CKA" && l.certCode === "CKAD")));
    const myMocks = labs.filter((l) => l.kind === "mock" && l.certCode === focus);
    const span = joinedAgo - stopsAgo;

    for (let ago = joinedAgo; ago >= Math.max(1, stopsAgo); ago--) {
      const day = addDays(today, -ago);
      const progress = span > 0 ? (joinedAgo - ago) / span : 1;
      if (rand() < pace.daysPerWeek / 7) {
        const usingSecond = second.length > 0 && rand() < 0.2;
        const set = usingSecond ? second : pool;
        if (set.length === 0) continue;
        const at = new Date(`${day}T${String(7 + Math.floor(rand() * 14)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00Z`);
        const picked = [...set].sort(() => rand() - 0.5).slice(0, 5 + Math.floor(rand() * 4));
        const quizId = randomUUID();
        quizzes.push({ id: quizId, userId: id, kind: "practice", feedback: "instant", certCode: picked[0]!.certCode, questionIds: picked.map((q) => q.id), createdAt: at, finishedAt: at });
        for (const [i, q] of picked.entries()) {
          const base = hard.has(q.id) ? 0.22 : (DOMAIN_ACCURACY[domainKey(q.refs[0])] ?? 0.72);
          const correct = rand() < Math.min(0.95, base + skill + progress * 0.08);
          const right = q.options.filter((o) => o.correct).map((o) => o.id);
          const wrong = q.options.find((o) => !o.correct)?.id ?? "a";
          answers.push({ userId: id, quizId, questionId: q.id, certCode: q.certCode, selected: correct ? right : [wrong], correct, answeredAt: new Date(at.getTime() + i * 50_000) });
        }
        if (myLessons.length > 0 && rand() < 0.3) {
          const lessonId = myLessons[Math.floor(rand() * myLessons.length)]!;
          if (!lessonRows.some((l) => l.userId === id && l.lessonId === lessonId)) lessonRows.push({ userId: id, lessonId, completedAt: new Date(at.getTime() - 20 * 60_000) });
        }
      }

      // Labs and mock exams, ended before today so nothing shows as running.
      const wantsMock = myMocks.length > 0 && progress > 0.4 && rand() < (pace.labsPerWeek / 7) * 0.35;
      const wantsLab = !wantsMock && myLabs.length > 0 && rand() < pace.labsPerWeek / 7;
      if (!wantsLab && !wantsMock) continue;
      const row = wantsMock ? myMocks[Math.floor(rand() * myMocks.length)]! : myLabs[Math.floor(rand() * myLabs.length)]!;
      const mode = wantsMock ? (rand() < 0.6 ? "exam" : "practice") : "lab";
      const created = new Date(`${day}T${String(8 + Math.floor(rand() * 12)).padStart(2, "0")}:15:00Z`);
      const outcome = rand();
      const status = outcome < 0.07 ? "failed" : outcome < 0.11 ? "killed" : outcome < 0.27 ? "expired" : "finished";
      const sessionId = randomUUID();
      if (status === "failed") {
        sessions.push({ id: sessionId, userId: id, labId: row.id, certCode: row.certCode, status, provider: "local-docker", minutes: row.minutes, mode, createdAt: created, endedAt: new Date(created.getTime() + 6 * 60_000), statusMessage: "Cluster did not become ready in time." });
        continue;
      }
      const ready = new Date(created.getTime() + (60 + Math.floor(rand() * 90)) * row.clusters.length * 1000);
      const started = mode === "lab" ? ready : new Date(ready.getTime() + (1 + Math.floor(rand() * 5)) * 60_000);
      const expires = new Date(started.getTime() + row.minutes * 60_000);
      const used = status === "expired" ? row.minutes : status === "killed" ? Math.round(row.minutes * 0.3) : Math.round(row.minutes * (0.45 + rand() * 0.5));
      const ended = status === "expired" ? expires : new Date(started.getTime() + used * 60_000);
      let score: number | null = null;
      if (status !== "killed") {
        const results = row.tasks.flatMap((t) => {
          const ref = t.competency ?? row.competencyRefs[0];
          const p = Math.min(0.95, (DOMAIN_ACCURACY[domainKey(ref)] ?? 0.72) + 0.06 + skill + progress * 0.08 - (status === "expired" ? 0.1 : 0));
          const passed = rand() < p;
          return t.checks.map((c) => ({ taskId: t.id, checkId: c.id, passed, message: c.description }));
        });
        const total = row.tasks.reduce((s, t) => s + t.weight, 0) || 1;
        score = Math.round((row.tasks.filter((t) => results.some((x) => x.taskId === t.id && x.passed)).reduce((s, t) => s + t.weight, 0) * 100) / total);
        checkRuns.push({ sessionId, kind: "final", results, score, createdAt: ended });
      }
      sessions.push({
        id: sessionId,
        userId: id,
        labId: row.id,
        certCode: row.certCode,
        status,
        provider: "local-docker",
        minutes: row.minutes,
        mode,
        createdAt: created,
        readyAt: ready,
        startedAt: mode === "lab" ? null : started,
        expiresAt: expires,
        endedAt: ended,
        score,
      });
    }
  }

  await insertChunks(users, (c) => db.insert(schema.user).values(c));
  await insertChunks(profiles, (c) => db.insert(schema.profile).values(c));
  await insertChunks(quizzes, (c) => db.insert(schema.quiz).values(c));
  await insertChunks(answers, (c) => db.insert(schema.answer).values(c));
  await insertChunks(lessonRows, (c) => db.insert(schema.lessonProgress).values(c));
  await insertChunks(sessions, (c) => db.insert(schema.labSession).values(c));
  await insertChunks(checkRuns, (c) => db.insert(schema.labCheckRun).values(c));
  return users.length;
}
