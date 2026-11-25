import { describe, expect, it } from "vitest";
import {
  CLOSE_CODES,
  minutesUsed,
  monthStart,
  nextMonthStart,
  parseClientMessage,
  scoreOf,
  signTerminalToken,
  startBlock,
  taskStates,
  verifyTerminalToken,
} from "../src/index.ts";

const tasks = [
  { id: "a", weight: 40, checks: [{ id: "a1" }, { id: "a2" }] },
  { id: "b", weight: 60, checks: [{ id: "b1" }] },
];

describe("scoring", () => {
  it("gives partial credit per check within a task", () => {
    expect(scoreOf(tasks, [{ taskId: "a", checkId: "a1", passed: true, message: "" }])).toBe(20);
    expect(
      scoreOf(tasks, [
        { taskId: "a", checkId: "a1", passed: true, message: "" },
        { taskId: "a", checkId: "a2", passed: true, message: "" },
        { taskId: "b", checkId: "b1", passed: true, message: "" },
      ]),
    ).toBe(100);
    expect(scoreOf(tasks, [{ taskId: "b", checkId: "b1", passed: false, message: "" }])).toBe(0);
  });

  it("summarises task states", () => {
    expect(taskStates(tasks, undefined)).toEqual({ a: "unchecked", b: "unchecked" });
    expect(
      taskStates(tasks, [
        { taskId: "a", checkId: "a1", passed: true, message: "" },
        { taskId: "a", checkId: "a2", passed: false, message: "" },
        { taskId: "b", checkId: "b1", passed: true, message: "" },
      ]),
    ).toEqual({ a: "failed", b: "passed" });
  });
});

describe("quota", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("knows the month boundaries in UTC", () => {
    expect(monthStart(now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("counts minutes from ready to end, caps at expiry, ignores failed boots and last month", () => {
    const rows = [
      { readyAt: new Date("2026-11-25T10:00:00Z"), endedAt: new Date("2026-11-25T10:30:00Z"), expiresAt: null },
      { readyAt: new Date("2026-11-25T11:00:00Z"), endedAt: null, expiresAt: new Date("2026-11-25T11:20:00Z") },
      { readyAt: null, endedAt: new Date("2026-11-25T09:00:00Z"), expiresAt: null },
      { readyAt: new Date("2026-10-31T23:50:00Z"), endedAt: new Date("2026-11-01T00:10:00Z"), expiresAt: null },
      { readyAt: new Date("2026-11-25T11:50:00Z"), endedAt: null, expiresAt: new Date("2026-11-25T12:20:00Z") },
    ];
    expect(minutesUsed(rows, now)).toBe(30 + 20 + 10 + 10);
  });

  it("blocks a start for an active session, the quota, or capacity, in that order", () => {
    const base = { labMinutes: 30, minutesUsed: 0, monthlyMinutes: 600, activeSessionId: null, activeSessions: 0, maxActiveSessions: 3, now };
    expect(startBlock(base)).toBeNull();
    expect(startBlock({ ...base, activeSessionId: "s1" })).toEqual({ reason: "active-session", sessionId: "s1" });
    expect(startBlock({ ...base, minutesUsed: 580 })).toMatchObject({ reason: "quota", minutesLeft: 20 });
    expect(startBlock({ ...base, activeSessions: 3 })).toEqual({ reason: "capacity", active: 3, max: 3 });
  });
});

describe("terminal tokens", () => {
  const secret = "s".repeat(40);

  it("round-trips and expires", () => {
    const token = signTerminalToken({ sid: "abc", uid: "u1" }, secret, 60, 1_000_000);
    expect(verifyTerminalToken(token, secret, 1_000_000)).toEqual({ sid: "abc", uid: "u1", exp: 1060 });
    expect(verifyTerminalToken(token, secret, 1_061_000)).toBeNull();
  });

  it("rejects tampering and other secrets", () => {
    const token = signTerminalToken({ sid: "abc", uid: "u1" }, secret);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "abc", uid: "u2", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyTerminalToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifyTerminalToken(`${payload}.${sig}`, "t".repeat(40))).toBeNull();
    expect(verifyTerminalToken("garbage", secret)).toBeNull();
  });

  it("refuses short secrets", () => {
    expect(() => signTerminalToken({ sid: "a", uid: "b" }, "short")).toThrow();
  });
});

describe("terminal protocol", () => {
  it("accepts input and sane resizes only", () => {
    expect(parseClientMessage('{"type":"input","data":"ls\\r"}')).toEqual({ type: "input", data: "ls\r" });
    expect(parseClientMessage('{"type":"resize","cols":120,"rows":30}')).toEqual({ type: "resize", cols: 120, rows: 30 });
    expect(parseClientMessage('{"type":"resize","cols":-1,"rows":30}')).toBeNull();
    expect(parseClientMessage("not json")).toBeNull();
    expect(CLOSE_CODES.unauthorized).toBe(4401);
  });
});
