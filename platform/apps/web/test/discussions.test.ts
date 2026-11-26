import { describe, expect, it } from "vitest";
import {
  buildThreads,
  canAccept,
  countVisible,
  discussPath,
  excerpt,
  isTargetId,
  notificationEmail,
  pickActiveExam,
  safeBack,
  startsFolded,
  type PostRow,
} from "../src/lib/discussions.ts";

let next = 1;
function row(over: Partial<PostRow> = {}): PostRow {
  return {
    id: next++,
    parentId: null,
    userId: "u1",
    authorName: "Ann",
    authorRole: "user",
    body: "hello",
    spoiler: false,
    accepted: false,
    status: "visible",
    hiddenReason: null,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    editedAt: null,
    votes: 0,
    ...over,
  };
}

const learner = { id: "me", role: "user" };
const admin = { id: "boss", role: "admin" };

describe("buildThreads", () => {
  it("orders threads by votes, then newest, and replies with the accepted one first, then oldest first", () => {
    const a = row({ votes: 1, createdAt: new Date("2026-11-01T10:00:00Z") });
    const b = row({ votes: 3 });
    const c = row({ votes: 1, createdAt: new Date("2026-11-02T10:00:00Z") });
    const r1 = row({ parentId: b.id, createdAt: new Date("2026-11-03T10:00:00Z") });
    const r2 = row({ parentId: b.id, createdAt: new Date("2026-11-04T10:00:00Z"), accepted: true });
    const r3 = row({ parentId: b.id, createdAt: new Date("2026-11-02T12:00:00Z") });
    const threads = buildThreads([a, b, c, r1, r2, r3], learner, new Set([r1.id]));
    expect(threads.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
    expect(threads[0]!.replies.map((r) => r.id)).toEqual([r2.id, r3.id, r1.id]);
    expect(threads[0]!.replies.find((r) => r.id === r1.id)!.votedByMe).toBe(true);
  });

  it("hides hidden posts from other learners but shows them to their author and admins", () => {
    const hidden = row({ userId: "other", status: "hidden", body: "rude" });
    const mineHidden = row({ userId: "me", status: "hidden", body: "mine" });
    expect(buildThreads([hidden, mineHidden], learner, new Set()).map((t) => t.id)).toEqual([mineHidden.id]);
    const forAdmin = buildThreads([hidden], admin, new Set());
    expect(forAdmin[0]!.readable).toBe(true);
    expect(forAdmin[0]!.body).toBe("rude");
  });

  it("keeps a deleted thread as a bodiless placeholder only while it has replies", () => {
    const gone = row({ status: "deleted", body: "" });
    const goneWithReply = row({ status: "deleted", body: "" });
    const reply = row({ parentId: goneWithReply.id, userId: "x" });
    const threads = buildThreads([gone, goneWithReply, reply], learner, new Set());
    expect(threads.map((t) => t.id)).toEqual([goneWithReply.id]);
    expect(threads[0]!.readable).toBe(false);
    expect(threads[0]!.replies).toHaveLength(1);
  });

  it("drops replies whose thread the viewer cannot see", () => {
    const hidden = row({ userId: "other", status: "hidden" });
    const reply = row({ parentId: hidden.id, userId: "me" });
    expect(buildThreads([hidden, reply], learner, new Set())).toEqual([]);
  });
});

describe("rules", () => {
  it("counts only visible posts", () => {
    expect(countVisible([{ status: "visible" }, { status: "hidden" }, { status: "deleted" }, { status: "visible" }])).toBe(2);
  });

  it("folds question and mock task discussions until the learner has done them", () => {
    expect(startsFolded("question", false)).toBe(true);
    expect(startsFolded("question", true)).toBe(false);
    expect(startsFolded("mock-task", false)).toBe(true);
    expect(startsFolded("lesson", false)).toBe(false);
    expect(startsFolded("lab", false)).toBe(false);
  });

  it("lets the thread author and admins accept a reply", () => {
    expect(canAccept(learner, "me")).toBe(true);
    expect(canAccept(learner, "other")).toBe(false);
    expect(canAccept(admin, "other")).toBe(true);
  });

  it("finds a running exam-mode attempt, practical or multiple-choice, and ignores practice and finished ones", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const later = new Date("2026-11-26T13:00:00Z");
    const earlier = new Date("2026-11-26T11:00:00Z");
    expect(pickActiveExam([{ id: "s1", mode: "practice", status: "ready" }], [], now)).toBeNull();
    expect(pickActiveExam([{ id: "s1", mode: "exam", status: "finished" }], [], now)).toBeNull();
    expect(pickActiveExam([{ id: "s1", mode: "exam", status: "booting" }], [], now)).toEqual({ kind: "practical", href: "/mocks/attempts/s1" });
    expect(pickActiveExam([], [{ id: "q1", finishedAt: null, expiresAt: later }], now)).toEqual({ kind: "multiple-choice", href: "/mocks/quiz/q1" });
    expect(pickActiveExam([], [{ id: "q1", finishedAt: null, expiresAt: earlier }], now)).toBeNull();
    expect(pickActiveExam([], [{ id: "q1", finishedAt: earlier, expiresAt: later }], now)).toBeNull();
  });

  it("checks target ids and builds paths", () => {
    expect(isTargetId("lesson", "sample-cka-rbac")).toBe(true);
    expect(isTargetId("lesson", "../etc")).toBe(false);
    expect(isTargetId("lesson", "a/b")).toBe(false);
    expect(isTargetId("mock-task", "cka-mock/t1")).toBe(true);
    expect(isTargetId("mock-task", "cka-mock")).toBe(false);
    expect(discussPath("mock-task", "cka-mock/t1")).toBe("/discuss/mock-task/cka-mock/t1");
  });

  it("accepts only same-site back paths", () => {
    expect(safeBack("/labs/x")).toBe("/labs/x");
    expect(safeBack("//evil.example")).toBe("/today");
    expect(safeBack("https://evil.example")).toBe("/today");
    expect(safeBack(null, "/admin")).toBe("/admin");
  });
});

describe("emails", () => {
  it("never puts a spoiler in an email and shortens long posts", () => {
    expect(excerpt("kubectl get pods", true)).toMatch(/spoiler/);
    expect(excerpt("a ```x\ny``` b", false)).toBe("a [code] b");
    expect(excerpt("x".repeat(400), false)).toHaveLength(280);
  });

  it("writes the reply email with the discussion link and the opt-out link", () => {
    const mail = notificationEmail({
      kind: "reply",
      author: "Ann",
      label: "Lesson: RBAC",
      body: "Use kubectl auth can-i",
      spoiler: false,
      url: "http://x/discuss/lesson/rbac",
      unsubscribeUrl: "http://x/unsubscribe?k=discussions",
    });
    expect(mail.subject).toBe("New reply: Lesson: RBAC");
    expect(mail.text).toContain("Ann replied");
    expect(mail.text).toContain("Use kubectl auth can-i");
    expect(mail.text).toContain("http://x/discuss/lesson/rbac");
    expect(mail.text).toContain("Stop all discussion emails: http://x/unsubscribe?k=discussions");
  });

  it("writes the accepted email without the post body", () => {
    const mail = notificationEmail({ kind: "accepted", author: "Bo", label: "Lab: Pods", body: "secret", spoiler: false, url: "u", unsubscribeUrl: "v" });
    expect(mail.subject).toBe("Your answer was accepted: Lab: Pods");
    expect(mail.text).not.toContain("secret");
  });
});
