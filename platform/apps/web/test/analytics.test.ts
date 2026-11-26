import { describe, expect, it } from "vitest";
import {
  activeWithin,
  domainWeakness,
  parseRange,
  percentChange,
  questionWeakness,
  rangeStart,
  sessionMinutes,
  usageByLab,
  usageTotals,
  weekOf,
  weekStarts,
  weeklyActive,
  weeklyClusterMinutes,
  type DomainEvidence,
  type UsageSession,
} from "../src/lib/analytics.ts";

// 2026-11-26 is a Thursday.
const TODAY = "2026-11-26";

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekOf("2026-11-26")).toBe("2026-11-23");
    expect(weekOf("2026-11-23")).toBe("2026-11-23");
    expect(weekOf("2026-11-22")).toBe("2026-11-16");
  });
  it("lists the last weeks oldest first, ending this week", () => {
    expect(weekStarts(TODAY, 3)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(rangeStart(TODAY, 4)).toBe("2026-11-02");
  });
  it("accepts only the offered ranges", () => {
    expect(parseRange("4")).toBe(4);
    expect(parseRange("26")).toBe(26);
    expect(parseRange("7")).toBe(12);
    expect(parseRange(undefined)).toBe(12);
  });
});

describe("active learners", () => {
  const rows = [
    { userId: "a", day: "2026-11-26" },
    { userId: "a", day: "2026-11-24" },
    { userId: "b", day: "2026-11-20" },
    { userId: "c", day: "2026-11-01" },
    { userId: "d", day: "2026-10-01" },
  ];
  it("counts each learner once per week and fills empty weeks", () => {
    expect(weeklyActive(rows, TODAY, 4)).toEqual([
      { week: "2026-11-02", value: 0 },
      { week: "2026-11-09", value: 0 },
      { week: "2026-11-16", value: 1 },
      { week: "2026-11-23", value: 1 },
    ]);
  });
  it("counts learners active in the last days, today included", () => {
    expect(activeWithin(rows, TODAY, 7)).toBe(2);
    expect(activeWithin(rows, TODAY, 30)).toBe(3);
  });
  it("gives no change against an empty period", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(6, 4)).toBe(50);
  });
});

describe("weak spots", () => {
  const ev = (userId: string, domainKey: string, correct: boolean, source: DomainEvidence["source"] = "question"): DomainEvidence => ({ userId, certCode: "CKA", domainKey, correct, source });
  it("orders domains weakest first and leaves out thin ones", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ev(`u${i % 3}`, "storage", i < 4)),
      ...Array.from({ length: 10 }, (_, i) => ev("u1", "workloads", i < 8, i < 2 ? "task" : "question")),
      ev("u1", "networking", false),
    ];
    const out = domainWeakness(rows, 5);
    expect(out.map((d) => d.domainKey)).toEqual(["storage", "workloads"]);
    expect(out[0]).toMatchObject({ learners: 3, answers: 10, tasks: 0, accuracy: 0.4 });
    expect(out[1]).toMatchObject({ learners: 1, answers: 8, tasks: 2, accuracy: 0.8 });
  });
  it("sums a question's answers across learners", () => {
    const out = questionWeakness(
      [
        { questionId: "q1", userId: "a", answers: 3, correct: 0 },
        { questionId: "q1", userId: "b", answers: 2, correct: 1 },
        { questionId: "q2", userId: "a", answers: 5, correct: 4 },
        { questionId: "q3", userId: "a", answers: 2, correct: 0 },
      ],
      5,
    );
    expect(out).toEqual([
      { questionId: "q1", learners: 2, answers: 5, accuracy: 0.2 },
      { questionId: "q2", learners: 1, answers: 5, accuracy: 0.8 },
    ]);
  });
});

describe("lab and mock usage", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 25, h, m));
  const base: UsageSession = { userId: "a", labId: "lab1", mode: "lab", status: "finished", createdAt: at(10), readyAt: at(10, 2), endedAt: at(10, 22), expiresAt: at(10, 32), score: 80, clusters: 1, passPercent: null };
  const now = at(12);
  it("counts cluster time from ready to the end, capped at expiry", () => {
    expect(sessionMinutes(base, now)).toBe(20);
    expect(sessionMinutes({ ...base, endedAt: at(11) }, now)).toBe(30);
    expect(sessionMinutes({ ...base, readyAt: null }, now)).toBe(0);
  });
  it("splits starts into completed, failed and killed, and weights minutes by clusters", () => {
    const sessions: UsageSession[] = [
      base,
      { ...base, userId: "b", status: "expired", score: 40, endedAt: at(10, 32) },
      { ...base, userId: "b", status: "failed", readyAt: null, score: null },
      { ...base, status: "killed", score: null, endedAt: at(10, 12) },
      { ...base, labId: "mock1", mode: "exam", clusters: 3, passPercent: 66, score: 70, endedAt: at(11, 2), expiresAt: at(12, 2) },
    ];
    const rows = usageByLab(sessions, now);
    expect(rows[0]).toMatchObject({ labId: "lab1", starts: 4, learners: 2, completed: 2, failed: 1, killed: 1, averageScore: 60, minutes: 60, clusterMinutes: 60 });
    expect(rows[1]).toMatchObject({ labId: "mock1", starts: 1, completed: 1, passed: 1, minutes: 60, clusterMinutes: 180 });
    expect(usageTotals(sessions, now)).toMatchObject({ starts: 5, clusterMinutes: 240, learners: 2 });
    expect(weeklyClusterMinutes(sessions, TODAY, 2, now)).toEqual([
      { week: "2026-11-16", value: 0 },
      { week: "2026-11-23", value: 240 },
    ]);
  });
});
