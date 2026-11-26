import { describe, expect, it } from "vitest";
import { bookingChecks, bookReady } from "../src/lib/booking.ts";
import { domainOf, evidenceAsOf, sessionSource, taskEvidence } from "../src/lib/evidence.ts";
import { computeReadiness, evidenceSummary, MIN_ANSWERS, type Evidence } from "../src/lib/readiness.ts";
import { isHard, pickSession, stepLabel, type QueueItem } from "../src/lib/review.ts";

const CKA = [
  { key: "cluster", name: "Cluster architecture", weight: 25 },
  { key: "workloads", name: "Workloads", weight: 15 },
  { key: "networking", name: "Networking", weight: 20 },
  { key: "storage", name: "Storage", weight: 10 },
  { key: "troubleshooting", name: "Troubleshooting", weight: 30 },
];

function many(domainKey: string, right: number, wrong: number, source: Evidence["source"] = "question"): Evidence[] {
  return [
    ...Array.from({ length: right }, () => ({ domainKey, correct: true, ageDays: 0, source })),
    ...Array.from({ length: wrong }, () => ({ domainKey, correct: false, ageDays: 0, source })),
  ];
}

describe("readiness from several sources", () => {
  it("counts a lab task as 2 points and a mock exam task as 3 toward a score", () => {
    const r = computeReadiness(CKA, [...many("cluster", 3, 0, "lab"), ...many("networking", 2, 0, "mock"), ...many("troubleshooting", 8, 0)]);
    expect(r.points).toBe(3 * 2 + 2 * 3 + 8);
    expect(r.answers).toBe(13);
    expect(r.sufficient).toBe(r.points >= MIN_ANSWERS);
    expect(r.bySource).toEqual({ question: 8, lab: 3, mock: 2, lesson: 0 });
  });
  it("moves mastery further for a passed mock task than for a right answer", () => {
    const fromQuestion = computeReadiness(CKA, many("storage", 1, 0)).domains.find((d) => d.key === "storage")!.mastery;
    const fromMock = computeReadiness(CKA, many("storage", 1, 0, "mock")).domains.find((d) => d.key === "storage")!.mastery;
    expect(fromMock).toBeGreaterThan(fromQuestion);
  });
  it("lets a lesson nudge mastery up without earning points or counting as graded evidence", () => {
    const r = computeReadiness(CKA, many("storage", 4, 0, "lesson"));
    const storage = r.domains.find((d) => d.key === "storage")!;
    expect(storage.mastery).toBeGreaterThan(1 / 3);
    expect(storage.mastery).toBeLessThanOrEqual(0.5);
    const more = computeReadiness(CKA, many("storage", 20, 0, "lesson")).domains.find((d) => d.key === "storage")!;
    expect(more.mastery).toBe(storage.mastery);
    expect(storage.answers).toBe(0);
    expect(storage.level).toBe("none");
    expect(r.points).toBe(0);
    expect(r.bySource.lesson).toBe(4);
  });
  it("summarises the evidence in words", () => {
    expect(evidenceSummary({ question: 24, lab: 3, mock: 1, lesson: 2 })).toBe("24 answers, 3 lab tasks and 1 mock exam task");
    expect(evidenceSummary({ question: 1, lab: 0, mock: 0, lesson: 0 })).toBe("1 answer");
    expect(evidenceSummary({ question: 0, lab: 0, mock: 0, lesson: 5 })).toBe("no graded answers");
  });
});

describe("evidence from labs and mock exams", () => {
  const tasks = [
    { id: "t1", competency: "cka/storage/pv", checks: [{ id: "a" }, { id: "b" }] },
    { id: "t2", checks: [{ id: "a" }] },
    { id: "t3", checks: [{ id: "a" }] },
    { id: "t4", checks: [] },
  ];
  it("gives one piece per graded task, right only when every check passed", () => {
    const results = [
      { taskId: "t1", checkId: "a", passed: true },
      { taskId: "t1", checkId: "b", passed: false },
      { taskId: "t2", checkId: "a", passed: true },
    ];
    expect(taskEvidence(tasks, ["ckad/x/y", "cka/workloads/deploy"], "CKA", results, "lab", "2026-11-20")).toEqual([
      { domainKey: "storage", correct: false, source: "lab", day: "2026-11-20" },
      { domainKey: "workloads", correct: true, source: "lab", day: "2026-11-20" },
    ]);
  });
  it("skips tasks with no competency in the cert", () => {
    expect(taskEvidence([{ id: "t", checks: [{ id: "a" }] }], ["ckad/x/y"], "CKA", [{ taskId: "t", checkId: "a", passed: true }], "mock", "2026-11-20")).toEqual([]);
  });
  it("counts only exam-mode mock attempts as mock evidence", () => {
    expect(sessionSource("exam")).toBe("mock");
    expect(sessionSource("practice")).toBe("lab");
    expect(sessionSource("lab")).toBe("lab");
  });
  it("finds the domain of the first ref in the cert", () => {
    expect(domainOf([undefined, "kcna/a/b", "cka/storage/pv"], "CKA")).toBe("storage");
    expect(domainOf(["kcna/a/b"], "CKA")).toBeUndefined();
  });
  it("ages evidence and drops what came later", () => {
    const rows = [
      { domainKey: "storage", correct: true, source: "question" as const, day: "2026-11-01" },
      { domainKey: "storage", correct: false, source: "lab" as const, day: "2026-11-20" },
    ];
    expect(evidenceAsOf(rows, "2026-11-10")).toEqual([{ domainKey: "storage", correct: true, source: "question", ageDays: 9 }]);
    expect(evidenceAsOf(rows, "2026-11-20")).toHaveLength(2);
  });
});

describe("booking checklist", () => {
  const strong = computeReadiness(CKA, CKA.flatMap((d) => many(d.key, 30, 1)));
  const weakStorage = computeReadiness(CKA, [...CKA.filter((d) => d.key !== "storage").flatMap((d) => many(d.key, 40, 0)), ...many("storage", 1, 8)]);
  it("is ready when readiness, every domain and a recent mock pass are met", () => {
    const checks = bookingChecks(strong, { mockAvailable: true, attempts: [{ at: "2026-11-20", score: 75, passMark: 66 }], today: "2026-11-26" });
    expect(checks.map((c) => c.key)).toEqual(["readiness", "domains", "mock"]);
    expect(bookReady(checks)).toBe(true);
  });
  it("flags a weak domain hidden behind a high weighted score", () => {
    expect(weakStorage.ready).toBe(true);
    const checks = bookingChecks(weakStorage, { mockAvailable: false, attempts: [], today: "2026-11-26" });
    const domains = checks.find((c) => c.key === "domains")!;
    expect(domains.met).toBe(false);
    expect(domains.label).toContain("Storage");
    expect(checks.some((c) => c.key === "mock")).toBe(false);
  });
  it("ignores a failed or stale mock attempt", () => {
    const stale = bookingChecks(strong, { mockAvailable: true, attempts: [{ at: "2026-09-01", score: 90, passMark: 66 }], today: "2026-11-26" });
    expect(bookReady(stale)).toBe(false);
    const failed = bookingChecks(strong, { mockAvailable: true, attempts: [{ at: "2026-11-25", score: 60, passMark: 66 }], today: "2026-11-26" });
    expect(failed.find((c) => c.key === "mock")!.label).toContain("60%");
  });
});

describe("review sessions", () => {
  const item = (questionId: string, certCode: string, dueOn: string, box = 0, lapses = 1): QueueItem => ({ questionId, certCode, dueOn, box, lapses });
  it("takes the most overdue and least learned first", () => {
    const picked = pickSession([item("c", "CKA", "2026-11-25", 2), item("a", "CKA", "2026-11-20", 3), item("b", "CKA", "2026-11-25", 0)], 2);
    expect(picked.map((p) => p.questionId)).toEqual(["a", "b"]);
  });
  it("interleaves certs", () => {
    const due = [item("k1", "KCNA", "2026-11-20"), item("k2", "KCNA", "2026-11-21"), item("k3", "KCNA", "2026-11-22"), item("c1", "CKA", "2026-11-23"), item("c2", "CKA", "2026-11-24")];
    expect(pickSession(due).map((p) => p.questionId)).toEqual(["k1", "c1", "k2", "c2", "k3"]);
  });
  it("labels steps and hard questions", () => {
    expect(stepLabel(0)).toBe("Step 1 of 5");
    expect(stepLabel(4)).toBe("Step 5 of 5");
    expect(isHard({ lapses: 2 })).toBe(false);
    expect(isHard({ lapses: 3 })).toBe(true);
  });
});
