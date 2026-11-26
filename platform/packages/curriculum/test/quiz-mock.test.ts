import { describe, expect, it } from "vitest";
import { domainQuota, drawQuestions, isCorrectChoice, scoreQuizMock, shuffle } from "../src/index.ts";

/** A small deterministic random source (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KCNA = [
  { key: "fundamentals", weight: 44 },
  { key: "orchestration", weight: 28 },
  { key: "delivery", weight: 16 },
  { key: "architecture", weight: 12 },
];

describe("multiple-choice mocks", () => {
  it("splits questions by exam weight when the bank is big enough (KCNA: 60 → 26/17/10/7)", () => {
    const available = new Map(KCNA.map((d) => [d.key, 100]));
    const quota = domainQuota(KCNA, available, 60);
    expect(Object.fromEntries(quota)).toEqual({ fundamentals: 26, orchestration: 17, delivery: 10, architecture: 7 });
    expect([...quota.values()].reduce((a, b) => a + b, 0)).toBe(60);
  });

  it("gives seats a short domain cannot fill to the others, and never asks more than the bank holds", () => {
    const available = new Map([
      ["fundamentals", 5],
      ["orchestration", 40],
      ["delivery", 2],
      ["architecture", 40],
    ]);
    const quota = domainQuota(KCNA, available, 30);
    expect(quota.get("fundamentals")).toBe(5);
    expect(quota.get("delivery")).toBe(2);
    expect([...quota.values()].reduce((a, b) => a + b, 0)).toBe(30);
    expect(quota.get("orchestration")! > quota.get("architecture")!).toBe(true);
    const all = domainQuota(KCNA, new Map([["fundamentals", 3], ["delivery", 1]]), 60);
    expect([...all.values()].reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("draws distinct questions by domain and prefers unseen ones", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, domain: "fundamentals" })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, domain: "orchestration" })),
    ];
    const seen = new Set(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);
    const ids = drawQuestions({ pool, domains: KCNA, count: 6, seen, random: seeded(1) });
    expect(new Set(ids).size).toBe(6);
    const f = ids.filter((id) => id.startsWith("f"));
    expect(f).toHaveLength(4);
    // Two unseen fundamentals questions exist; both are drawn before any seen one.
    expect(f).toEqual(expect.arrayContaining(["f8", "f9"]));
  });

  it("uses a fixed list when given, shuffled, leaving out questions no longer in the bank", () => {
    const pool = [{ id: "a", domain: "x" }, { id: "b", domain: "x" }, { id: "c", domain: "y" }];
    const ids = drawQuestions({ pool, domains: [], count: 5, fixed: ["a", "b", "c", "gone"], random: seeded(2) });
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
    expect(drawQuestions({ pool, domains: [], count: 2, fixed: ["a", "b", "c"], random: seeded(3) })).toHaveLength(2);
  });

  it("shuffles without losing items", () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(4)).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("marks an answer right only when it picks exactly the correct options", () => {
    expect(isCorrectChoice(["b"], ["b"])).toBe(true);
    expect(isCorrectChoice(["c", "a"], ["a", "c"])).toBe(true);
    expect(isCorrectChoice(["a"], ["a", "c"])).toBe(false);
    expect(isCorrectChoice(["a", "b", "c"], ["a", "c"])).toBe(false);
    expect(isCorrectChoice([], ["a"])).toBe(false);
  });

  it("scores every question alike and per domain, in curriculum order", () => {
    const r = scoreQuizMock(
      [
        { id: "1", domain: "orchestration", correct: true },
        { id: "2", domain: "fundamentals", correct: true },
        { id: "3", domain: "fundamentals", correct: false },
        { id: "4", domain: "fundamentals", correct: true },
      ],
      ["fundamentals", "orchestration"],
    );
    expect(r).toEqual({
      score: 75,
      right: 3,
      total: 4,
      domains: [
        { domain: "fundamentals", right: 2, total: 3, percent: 67 },
        { domain: "orchestration", right: 1, total: 1, percent: 100 },
      ],
    });
    expect(scoreQuizMock([]).score).toBe(0);
  });
});
