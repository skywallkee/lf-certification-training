import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { labSession, quiz } from "@/db/schema";
import { bookingChecks, bookReady, type BookingCheck, type MockAttemptSummary } from "@/lib/booking";
import type { CertStatusView } from "@/lib/cert-status";
import type { IsoDate } from "@/lib/dates";
import type { Readiness } from "@/lib/readiness";
import type { Catalog, CatalogCert } from "./catalog";
import { listLabs } from "./labs";
import { listMocks } from "./mocks";
import { listQuizMocks } from "./quiz-mocks";
import { getCompletedLessons, getEvidence, getReadiness, getReadinessHistory, getReviewQueue, getStatusViews } from "./progress";

/**
 * The progress dashboard: for each cert the learner is working on (focus, booked or studying), readiness with
 * its trend, what it is built from (questions, lessons, labs, mock exams), the review queue for the cert and the
 * booking checklist.
 */

export interface CertProgress {
  cert: CatalogCert;
  view: CertStatusView;
  focus: boolean;
  readiness: Readiness;
  history: { week: IsoDate; score: number | null; answers: number }[];
  questions: { answered: number; right: number; available: number };
  lessons: { done: number; total: number };
  labs: { solved: number; tried: number; total: number };
  mocks: { available: number; attempts: number; best: number | null; latest: number | null; passMark: number | null };
  reviewDue: number;
  reviewQueued: number;
  checks: BookingCheck[];
  bookReady: boolean;
}

export interface Dashboard {
  active: CertProgress[];
  passed: { cert: CatalogCert; view: CertStatusView }[];
  notStarted: number;
  totals: { lessons: number; labsSolved: number; mockAttempts: number; reviewDue: number };
}

const ORDER: Record<string, number> = { booked: 0, studying: 1 };

export async function getDashboard(userId: string, catalog: Catalog, today: IsoDate, focusCert: string | null): Promise<Dashboard> {
  const db = getDb();
  const [views, completed, labs, practicalMocks, sessions, queue, quizMocks, quizAttempts] = await Promise.all([
    getStatusViews(userId, catalog, today, focusCert),
    getCompletedLessons(userId),
    listLabs(),
    listMocks(),
    db
      .select({ labId: labSession.labId, certCode: labSession.certCode, mode: labSession.mode, score: labSession.score, startedAt: labSession.startedAt, endedAt: labSession.endedAt })
      .from(labSession)
      .where(and(eq(labSession.userId, userId), isNotNull(labSession.score))),
    getReviewQueue(userId),
    listQuizMocks(),
    db
      .select({ mockId: quiz.mockId, certCode: quiz.certCode, score: quiz.score, createdAt: quiz.createdAt, finishedAt: quiz.finishedAt })
      .from(quiz)
      .where(and(eq(quiz.userId, userId), eq(quiz.kind, "mock"), isNotNull(quiz.score))),
  ]);
  // Practical and multiple-choice mock exams count alike here: a graded exam-mode attempt with a pass mark.
  const mocks = [
    ...practicalMocks.map((m) => ({ id: m.id, certCode: m.certCode, passPercent: m.passPercent ?? 66 })),
    ...quizMocks.map((m) => ({ id: m.id, certCode: m.certCode, passPercent: m.passPercent })),
  ];
  const examAttempts = [
    ...sessions.filter((s) => s.mode === "exam" && s.startedAt).map((s) => ({ mockId: s.labId, certCode: s.certCode, score: s.score!, startedAt: s.startedAt!, endedAt: s.endedAt })),
    ...quizAttempts.map((a) => ({ mockId: a.mockId ?? "", certCode: a.certCode ?? "", score: a.score!, startedAt: a.createdAt, endedAt: a.finishedAt })),
  ];

  const activeCodes = [...views]
    .filter(([code, v]) => v.status === "booked" || v.status === "studying" || code === focusCert)
    .filter(([code, v]) => !(code === focusCert && (v.status === "passed" || v.status === "expiring")))
    .map(([code]) => code)
    .sort((a, b) => Number(b === focusCert) - Number(a === focusCert) || (ORDER[views.get(a)!.status] ?? 2) - (ORDER[views.get(b)!.status] ?? 2) || a.localeCompare(b));

  const active = await Promise.all(
    activeCodes.map(async (code): Promise<CertProgress> => {
      const cert = catalog.certs.get(code)!;
      const [readiness, history, evidence] = await Promise.all([
        getReadiness(userId, cert, today),
        getReadinessHistory(userId, cert, today),
        getEvidence(userId, code),
      ]);
      const answers = evidence.filter((e) => e.source === "question");
      const certLessons = catalog.lessons.filter((l) => l.certCode === code);
      const certLabs = labs.filter((l) => l.certCode === code);
      const labSessions = sessions.filter((s) => s.certCode === code && s.mode === "lab");
      const certMocks = mocks.filter((m) => m.certCode === code);
      const exams = examAttempts.filter((s) => s.certCode === code).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
      const passMarkOf = (mockId: string) => certMocks.find((m) => m.id === mockId)?.passPercent ?? 66;
      const attempts: MockAttemptSummary[] = exams.map((s) => ({
        at: (s.endedAt ?? s.startedAt).toISOString().slice(0, 10),
        score: s.score,
        passMark: passMarkOf(s.mockId),
      }));
      const checks = bookingChecks(readiness, { mockAvailable: certMocks.length > 0, attempts, today });
      const certQueue = queue.filter((q) => q.certCode === code);
      return {
        cert,
        view: views.get(code)!,
        focus: code === focusCert,
        readiness,
        history,
        questions: { answered: answers.length, right: answers.filter((a) => a.correct).length, available: catalog.questionCountByCert.get(code) ?? 0 },
        lessons: { done: certLessons.filter((l) => completed.has(l.id)).length, total: certLessons.length },
        labs: {
          solved: new Set(labSessions.filter((s) => s.score === 100).map((s) => s.labId)).size,
          tried: new Set(labSessions.map((s) => s.labId)).size,
          total: certLabs.length,
        },
        mocks: {
          available: certMocks.length,
          attempts: exams.length,
          best: exams.length ? Math.max(...exams.map((s) => s.score)) : null,
          latest: exams.at(-1)?.score ?? null,
          passMark: exams.length ? passMarkOf(exams.at(-1)!.mockId) : (certMocks[0]?.passPercent ?? null),
        },
        reviewDue: certQueue.filter((q) => q.dueOn <= today).length,
        reviewQueued: certQueue.length,
        checks,
        bookReady: bookReady(checks),
      };
    }),
  );

  const passed = [...views]
    .filter(([, v]) => v.status === "passed" || v.status === "expiring" || v.status === "expired")
    .map(([code, view]) => ({ cert: catalog.certs.get(code)!, view }))
    .sort((a, b) => (a.view.expiresOn ?? "").localeCompare(b.view.expiresOn ?? ""));
  const notStarted = [...views.values()].filter((v) => v.status === "not-started").length - activeCodes.filter((c) => views.get(c)!.status === "not-started").length;

  return {
    active,
    passed,
    notStarted,
    totals: {
      lessons: completed.size,
      labsSolved: new Set(sessions.filter((s) => s.mode === "lab" && s.score === 100).map((s) => s.labId)).size,
      mockAttempts: examAttempts.length,
      reviewDue: queue.filter((q) => q.dueOn <= today).length,
    },
  };
}
