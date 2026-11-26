import { describe, expect, it } from "vitest";
import { dueReminders, localClock, NUDGE_AFTER_DAYS, type ReminderContext } from "../src/lib/reminders.ts";
import { buildPlan, domainGap, hoursNeeded, studyMinutes, weekStart, type PlanDomain, type PlanInput } from "../src/lib/study-plan.ts";

const CKA: PlanDomain[] = [
  { key: "cluster", name: "Cluster architecture", weight: 25, mastery: 0.33, answers: 0 },
  { key: "workloads", name: "Workloads", weight: 15, mastery: 0.33, answers: 0 },
  { key: "networking", name: "Networking", weight: 20, mastery: 0.33, answers: 0 },
  { key: "storage", name: "Storage", weight: 10, mastery: 0.33, answers: 0 },
  { key: "troubleshooting", name: "Troubleshooting", weight: 30, mastery: 0.33, answers: 0 },
];

function input(over: Partial<PlanInput> = {}): PlanInput {
  // 2026-11-25 is a Wednesday.
  return { cert: "CKA", examStyle: "performance", today: "2026-11-25", examOn: "2027-01-20", hoursPerWeek: 5, domains: CKA, hasLabs: true, hasMock: true, ...over };
}

describe("study plan", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-11-25")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
  });

  it("counts a domain without graded evidence as a full gap", () => {
    expect(domainGap(CKA[0]!)).toBe(1);
    expect(domainGap({ ...CKA[0]!, answers: 10, mastery: 0.9 })).toBe(0);
    expect(hoursNeeded("performance", CKA)).toBe(40);
    expect(hoursNeeded("multiple-choice", CKA)).toBe(20);
  });

  it("runs from this week to the exam week, with a mock week before the exam week", () => {
    const plan = buildPlan(input());
    expect(plan.weeks[0]!.start).toBe("2026-11-25");
    expect(plan.weeks.at(-1)!.end).toBe("2027-01-20");
    expect(plan.weeks.at(-1)!.phase).toBe("exam");
    expect(plan.weeks.at(-2)!.phase).toBe("prepare");
    expect(plan.weeks.at(-2)!.tasks.some((t) => t.kind === "mock")).toBe(true);
    expect(plan.weeks.slice(0, -2).every((w) => w.phase === "learn")).toBe(true);
    // This week only has Wednesday to Sunday: 5 of 7 days.
    expect(plan.weeks[0]!.minutes).toBe(215);
    expect(plan.weeks[1]!.minutes).toBe(300);
  });

  it("puts the weakest heavy domains first", () => {
    const domains = CKA.map((d) => (d.key === "troubleshooting" ? d : { ...d, answers: 20, mastery: 0.75 }));
    const plan = buildPlan(input({ domains }));
    expect(plan.weeks[0]!.focus[0]).toBe("Troubleshooting");
  });

  it("keeps every week's tasks within its hours", () => {
    const plan = buildPlan(input({ hoursPerWeek: 3 }));
    for (const w of plan.weeks) {
      const sum = w.tasks.reduce((s, t) => s + t.minutes, 0);
      expect(sum).toBeLessThanOrEqual(w.minutes + 10);
    }
  });

  it("says on track, tight or behind from hours needed against hours available", () => {
    expect(buildPlan(input({ hoursPerWeek: 10 })).pace).toBe("on-track");
    const behind = buildPlan(input({ hoursPerWeek: 1, examOn: "2026-12-20" }));
    expect(behind.pace).toBe("behind");
    expect(behind.extraHoursPerWeek).toBeGreaterThan(0);
    expect(behind.paceNote).toMatch(/Add \d+ hours? a week/);
    const ready = buildPlan(input({ domains: CKA.map((d) => ({ ...d, answers: 30, mastery: 0.9 })) }));
    expect(ready.pace).toBe("ready");
  });

  it("uses a practice quiz for the mock week when the cert has no mock exam, and skips labs for multiple-choice exams", () => {
    const plan = buildPlan(input({ examStyle: "multiple-choice", hasMock: false }));
    const prep = plan.weeks.at(-2)!;
    expect(prep.tasks.some((t) => t.kind === "mock")).toBe(false);
    expect(prep.tasks.some((t) => t.kind === "quiz")).toBe(true);
    expect(plan.weeks.some((w) => w.tasks.some((t) => t.kind === "lab"))).toBe(false);
  });

  it("handles an exam this week and an exam today", () => {
    const soon = buildPlan(input({ examOn: "2026-11-28" }));
    expect(soon.weeks).toHaveLength(1);
    expect(soon.weeks[0]!.phase).toBe("exam");
    const today = buildPlan(input({ examOn: "2026-11-25" }));
    expect(today.weeks[0]!.minutes).toBe(0);
    expect(today.daysLeft).toBe(0);
  });

  it("flags a date in the past", () => {
    const past = buildPlan(input({ examOn: "2026-11-01" }));
    expect(past.weeks).toHaveLength(0);
    expect(past.paceNote).toMatch(/passed/);
  });

  it("estimates study minutes from activity", () => {
    expect(studyMinutes({ answers: 10, lessonMinutes: 20, sessionMinutes: 45 })).toBe(80);
  });
});

describe("reminders", () => {
  const base: ReminderContext = {
    // Monday 30 November 2026, 09:30 UTC = 11:30 in Bucharest.
    now: new Date("2026-11-30T09:30:00Z"),
    timeZone: "Europe/Bucharest",
    prefs: { weekly: true, nudge: true, exam: true, day: 1, hour: 8 },
    lastStudyDay: "2026-11-29",
    onboardedDay: "2026-11-01",
    exams: [{ cert: "CKA", examOn: "2026-12-07" }],
  };

  it("reads the weekday and hour in the learner's time zone", () => {
    expect(localClock("Europe/Bucharest", base.now)).toEqual({ weekday: 1, hour: 11 });
    expect(localClock("America/Los_Angeles", base.now)).toEqual({ weekday: 1, hour: 1 });
  });

  it("sends the weekly plan on the chosen day and the countdown a week before", () => {
    const due = dueReminders(base);
    expect(due.map((d) => d.key)).toEqual(["weekly:2026-11-30", "exam:CKA:2026-12-07:7"]);
  });

  it("waits for the chosen hour", () => {
    expect(dueReminders({ ...base, prefs: { ...base.prefs, hour: 12 } })).toEqual([]);
  });

  it("sends no weekly plan without an upcoming exam, or on another day", () => {
    expect(dueReminders({ ...base, exams: [] }).some((d) => d.kind === "weekly")).toBe(false);
    expect(dueReminders({ ...base, prefs: { ...base.prefs, day: 2 } }).some((d) => d.kind === "weekly")).toBe(false);
  });

  it("nudges once per quiet spell, after the set number of days", () => {
    const idle = { ...base, lastStudyDay: "2026-11-26" };
    const nudge = dueReminders(idle).find((d) => d.kind === "nudge");
    expect(nudge?.key).toBe("nudge:2026-11-26");
    expect(dueReminders({ ...base, lastStudyDay: "2026-11-28" }).some((d) => d.kind === "nudge")).toBe(false);
    // Never studied: counts from onboarding.
    expect(dueReminders({ ...base, lastStudyDay: null }).find((d) => d.kind === "nudge")?.key).toBe("nudge:2026-11-01");
    expect(NUDGE_AFTER_DAYS).toBe(3);
  });

  it("sends nothing that is turned off", () => {
    expect(dueReminders({ ...base, lastStudyDay: "2026-11-01", prefs: { ...base.prefs, weekly: false, nudge: false, exam: false } })).toEqual([]);
  });

  it("sends the day-before countdown", () => {
    const due = dueReminders({ ...base, exams: [{ cert: "CKA", examOn: "2026-12-01" }] });
    expect(due.some((d) => d.key === "exam:CKA:2026-12-01:1")).toBe(true);
  });
});
