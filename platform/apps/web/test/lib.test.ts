import { describe, expect, it } from "vitest";
import { certStatusView, expiryDate } from "../src/lib/cert-status.ts";
import { addDays, addMonths, daysBetween, isIsoDate, todayIn } from "../src/lib/dates.ts";
import { nextStep, rankDomains } from "../src/lib/next-step.ts";
import { chooseFocus } from "../src/lib/path.ts";
import { computeReadiness, MIN_ANSWERS, pct, type Evidence } from "../src/lib/readiness.ts";
import { nextReviewState } from "../src/lib/review.ts";
import { currentStreak } from "../src/lib/streak.ts";

const CKA = [
  { key: "cluster", name: "Cluster architecture", weight: 25 },
  { key: "workloads", name: "Workloads", weight: 15 },
  { key: "networking", name: "Networking", weight: 20 },
  { key: "storage", name: "Storage", weight: 10 },
  { key: "troubleshooting", name: "Troubleshooting", weight: 30 },
];

function answers(domainKey: string, right: number, wrong: number, ageDays = 0): Evidence[] {
  return [
    ...Array.from({ length: right }, () => ({ domainKey, correct: true, ageDays })),
    ...Array.from({ length: wrong }, () => ({ domainKey, correct: false, ageDays })),
  ];
}

describe("dates", () => {
  it("adds months and clamps to the end of the month", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-01-03", 24)).toBe("2027-01-03");
  });
  it("counts days and validates dates", () => {
    expect(daysBetween("2026-11-24", "2026-12-01")).toBe(7);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
  it("uses the learner's time zone for today, and falls back to UTC", () => {
    const instant = new Date("2026-11-24T23:30:00Z");
    expect(todayIn("Europe/Bucharest", instant)).toBe("2026-11-25");
    expect(todayIn("America/New_York", instant)).toBe("2026-11-24");
    expect(todayIn("Not/AZone", instant)).toBe("2026-11-24");
  });
});

describe("cert status", () => {
  it("computes expiry from the pass date and the cert's validity", () => {
    expect(expiryDate("KCNA", "2025-01-03")).toBe("2027-01-03");
  });
  it("moves from passed to expiring to expired", () => {
    const passed = { state: "passed" as const, passedOn: "2025-01-03", bookedFor: null };
    expect(certStatusView("KCNA", passed, "2026-06-01").status).toBe("passed");
    expect(certStatusView("KCNA", passed, "2026-11-24")).toMatchObject({ status: "expiring", daysLeft: 40 });
    expect(certStatusView("KCNA", passed, "2027-01-03").status).toBe("expired");
  });
  it("shows booked with a countdown, and studying only when asked", () => {
    expect(certStatusView("CKA", { state: "booked", bookedFor: "2027-01-18", passedOn: null }, "2026-11-24")).toEqual({
      status: "booked",
      bookedFor: "2027-01-18",
      daysLeft: 55,
    });
    expect(certStatusView("CKA", undefined, "2026-11-24").status).toBe("not-started");
    expect(certStatusView("CKA", undefined, "2026-11-24", { studying: true }).status).toBe("studying");
  });
});

describe("readiness", () => {
  it("withholds a score until there is enough evidence", () => {
    const r = computeReadiness(CKA, answers("storage", 10, 0));
    expect(r.sufficient).toBe(false);
    expect(r.answersNeeded).toBe(MIN_ANSWERS - 10);
    expect(r.domainsNeeded).toBe(2);
  });
  it("never reaches 100% from a handful of right answers", () => {
    const r = computeReadiness(CKA, [...answers("cluster", 5, 0), ...answers("networking", 5, 0), ...answers("troubleshooting", 10, 0)]);
    expect(r.sufficient).toBe(true);
    expect(r.score).toBeLessThan(0.9);
    expect(r.high).toBeLessThanOrEqual(1);
    expect(r.low).toBeLessThan(r.score);
  });
  it("weights domains by the official weights", () => {
    const strongInHeavy = computeReadiness(CKA, [...answers("troubleshooting", 20, 0), ...answers("storage", 0, 20)]);
    const strongInLight = computeReadiness(CKA, [...answers("troubleshooting", 0, 20), ...answers("storage", 20, 0)]);
    expect(strongInHeavy.score).toBeGreaterThan(strongInLight.score);
  });
  it("counts old answers less than recent ones", () => {
    const recentWrong = computeReadiness(CKA, [...answers("storage", 10, 0, 120), ...answers("storage", 0, 10, 0)]);
    const oldWrong = computeReadiness(CKA, [...answers("storage", 10, 0, 0), ...answers("storage", 0, 10, 120)]);
    const storage = (r: typeof recentWrong) => r.domains.find((d) => d.key === "storage")!.mastery;
    expect(storage(oldWrong)).toBeGreaterThan(storage(recentWrong));
  });
  it("is ready at 80% with enough evidence", () => {
    const r = computeReadiness(CKA, CKA.flatMap((d) => answers(d.key, 30, 1)));
    expect(r.ready).toBe(true);
    expect(pct(r.score)).toBeGreaterThanOrEqual(80);
    expect(r.domains.every((d) => d.level === "mastered")).toBe(true);
  });
});

describe("spaced review", () => {
  it("adds a missed question for tomorrow and ignores a first-time right answer", () => {
    expect(nextReviewState(undefined, false, "2026-11-24")).toEqual({ box: 0, dueOn: "2026-11-25", lapses: 1 });
    expect(nextReviewState(undefined, true, "2026-11-24")).toBeUndefined();
  });
  it("moves up a box on a right answer and retires after the last box", () => {
    expect(nextReviewState({ box: 0, dueOn: "2026-11-25", lapses: 1 }, true, "2026-11-25")).toEqual({ box: 1, dueOn: "2026-11-27", lapses: 1 });
    expect(nextReviewState({ box: 4, dueOn: "2026-12-01", lapses: 1 }, true, "2026-12-01")).toBeNull();
  });
  it("sends a missed item back to box 0 and counts the lapse", () => {
    expect(nextReviewState({ box: 3, dueOn: "2026-12-01", lapses: 1 }, false, "2026-12-01")).toEqual({ box: 0, dueOn: "2026-12-02", lapses: 2 });
  });
});

describe("streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(currentStreak(["2026-11-22", "2026-11-23", "2026-11-24"], "2026-11-24")).toBe(3);
    expect(currentStreak(["2026-11-22", "2026-11-23"], "2026-11-24")).toBe(2);
    expect(currentStreak(["2026-11-20"], "2026-11-24")).toBe(0);
  });
});

describe("path and next step", () => {
  it("chooses the first cert not held within the goal", () => {
    expect(chooseFocus("golden", null, new Set())).toBe("KCNA");
    expect(chooseFocus("golden", null, new Set(["KCNA", "KCSA"]))).toBe("CKA");
    expect(chooseFocus("kubestronaut", null, new Set(["KCNA", "KCSA", "CKA", "CKAD", "CKS"]))).toBeNull();
    expect(chooseFocus("one", "CKNE", new Set())).toBe("CKNE");
  });

  const readiness = computeReadiness(CKA, [...answers("storage", 1, 6), ...answers("troubleshooting", 12, 2)]);
  const competencies = [
    { ref: "cka/storage/classes", statement: "Storage classes", domainKey: "storage" },
    { ref: "cka/cluster/rbac", statement: "RBAC", domainKey: "cluster" },
  ];

  it("ranks the heaviest, weakest domain first", () => {
    const ranked = rankDomains(readiness.domains).map((d) => d.key);
    expect(ranked.indexOf("cluster")).toBeLessThan(ranked.indexOf("troubleshooting"));
  });

  it("recommends an unfinished lesson in the top domain, then questions, then thin content", () => {
    const base = {
      cert: "CKA",
      domains: readiness.domains,
      competencies,
      lessons: [{ id: "rbac", title: "RBAC", minutes: 9, competencyRefs: ["cka/cluster/rbac"] }],
      completedLessons: new Set<string>(),
      questionsByCompetency: new Map([["cka/storage/classes", 3]]),
    };
    expect(nextStep(base)).toMatchObject({ kind: "lesson", lesson: { id: "rbac" } });
    expect(nextStep({ ...base, completedLessons: new Set(["rbac"]) })).toMatchObject({ kind: "quiz", domain: { key: "storage" }, questions: 3 });
    expect(nextStep({ ...base, lessons: [], questionsByCompetency: new Map() })).toEqual({ kind: "thin-content", cert: "CKA" });
    expect(nextStep({ ...base, cert: null })).toEqual({ kind: "pick-focus" });
  });
});
