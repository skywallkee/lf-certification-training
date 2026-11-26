import { describe, expect, it } from "vitest";
import { domainTrends, parsePlayerState, trendSummary } from "../src/index.ts";

const at = (d: string) => new Date(`2026-11-${d}T10:00:00Z`);

describe("score trends", () => {
  const attempts = [
    { id: "2", at: at("10"), score: 55, mode: "exam", passMark: 66, domains: [{ domain: "storage", percent: 40 }, { domain: "net", percent: 70 }] },
    { id: "1", at: at("03"), score: 40, mode: "practice", passMark: 66, domains: [{ domain: "storage", percent: 20 }] },
    { id: "3", at: at("20"), score: 72, mode: "exam", passMark: 66, domains: [{ domain: "storage", percent: 80 }, { domain: "net", percent: 60 }] },
  ];

  it("summarises the latest, the change since the previous attempt, the best and the passes", () => {
    expect(trendSummary(attempts)).toEqual({ attempts: 3, latest: 72, previous: 55, change: 17, best: 72, average: 56, passed: 1 });
    expect(trendSummary([])).toMatchObject({ attempts: 0, latest: null, change: null, best: null });
    expect(trendSummary([attempts[0]!])).toMatchObject({ latest: 55, previous: null, change: null });
  });

  it("follows each domain across attempts, oldest first, weakest latest first", () => {
    expect(domainTrends(attempts)).toEqual([
      { domain: "net", percents: [null, 70, 60], first: 70, latest: 60, change: -10 },
      { domain: "storage", percents: [20, 40, 80], first: 20, latest: 80, change: 60 },
    ]);
  });
});

describe("player state", () => {
  it("keeps valid fields and drops the rest", () => {
    expect(parsePlayerState({ current: 2, flags: ["a", "zz", "a", 3], tab: "docs", doc: 1 }, ["a", "b", "c"])).toEqual({
      current: 2,
      flags: ["a"],
      tab: "docs",
      doc: 1,
    });
    expect(parsePlayerState({ current: 9, tab: "x", doc: -1 }, ["a"])).toEqual({ current: 0, flags: [], tab: "tasks", doc: 0 });
    expect(parsePlayerState(null, [])).toEqual({ current: 0, flags: [], tab: "tasks", doc: 0 });
  });
});
