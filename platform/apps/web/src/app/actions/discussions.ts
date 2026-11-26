"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import { getDb } from "@/db";
import { discussionFollow, discussionPost, discussionReport, discussionVote, profile } from "@/db/schema";
import {
  AUTO_HIDE_REPORTS,
  BODY_MAX,
  BODY_MIN,
  POST_LIMIT,
  REPORT_REASON_VALUES,
  canAccept,
  isTargetId,
  isTargetType,
  safeBack,
  type TargetType,
} from "@/lib/discussions";
import { describeTarget, getActiveExam, notify } from "@/server/discussions";
import { hit } from "@/server/rate-limit";
import { requireAdmin, requireUser, type SessionUser } from "@/server/session";

export interface PostFormState {
  error?: string;
  /** Changes on every successful post, so the form clears itself. */
  ok?: number;
}

const EXAM_ERROR = "Discussions are closed while your mock exam runs. Finish it first.";

const Body = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").trim())
  .pipe(z.string().min(BODY_MIN, "Write a little more.").max(BODY_MAX, `Keep it under ${BODY_MAX} characters.`));

function target(form: FormData): { type: TargetType; id: string } | null {
  const type = form.get("targetType");
  const id = String(form.get("targetId") ?? "");
  return isTargetType(type) && isTargetId(type, id) ? { type, id } : null;
}

/** The post and its target, if the user may act on it; null otherwise. Hidden posts are only for admins and their author. */
async function loadPost(user: SessionUser, postId: unknown) {
  const id = z.coerce.number().int().positive().safeParse(postId);
  if (!id.success) return null;
  const [post] = await getDb().select().from(discussionPost).where(eq(discussionPost.id, id.data));
  if (!post) return null;
  if (post.status === "hidden" && user.role !== "admin" && post.userId !== user.id) return null;
  const info = await describeTarget(post.targetType, post.targetId, user);
  return info ? { post, info } : null;
}

async function examBlocked(user: SessionUser): Promise<boolean> {
  return (await getActiveExam(user.id)) !== null;
}

/** Starts a thread, or replies to one (parentId). Posting follows the discussion. */
export async function createPostAction(_prev: PostFormState, form: FormData): Promise<PostFormState> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  const t = target(form);
  if (!t) return { error: "This discussion does not exist." };
  if (await examBlocked(user)) return { error: EXAM_ERROR };
  const body = Body.safeParse(String(form.get("body") ?? ""));
  if (!body.success) return { error: body.error.issues[0]?.message ?? "Check your post." };
  const info = await describeTarget(t.type, t.id, user);
  if (!info) return { error: "This discussion does not exist." };
  const db = getDb();
  let parentId: number | null = null;
  if (form.get("parentId")) {
    const parent = await loadPost(user, form.get("parentId"));
    if (!parent || parent.post.parentId !== null || parent.post.targetType !== t.type || parent.post.targetId !== t.id || parent.post.status === "deleted") {
      return { error: "That thread is no longer there." };
    }
    parentId = parent.post.id;
  }
  if (!hit(`discussion-post:${user.id}`, POST_LIMIT)) return { error: "You are posting very fast. Wait a few minutes and try again." };
  const spoiler = form.get("spoiler") === "on";
  await db.insert(discussionPost).values({ targetType: t.type, targetId: t.id, parentId, userId: user.id, body: body.data, spoiler });
  await db.insert(discussionFollow).values({ userId: user.id, targetType: t.type, targetId: t.id }).onConflictDoNothing();
  after(() =>
    notify({ kind: parentId ? "reply" : "thread", target: info, actor: user, body: body.data, spoiler }).catch((e) => console.error("[discussions] notify failed:", e)),
  );
  revalidatePath(back);
  return { ok: Date.now() };
}

export async function editPostAction(_prev: PostFormState, form: FormData): Promise<PostFormState> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  if (await examBlocked(user)) return { error: EXAM_ERROR };
  const found = await loadPost(user, form.get("postId"));
  if (!found || found.post.userId !== user.id || found.post.status === "deleted") return { error: "You can only edit your own posts." };
  const body = Body.safeParse(String(form.get("body") ?? ""));
  if (!body.success) return { error: body.error.issues[0]?.message ?? "Check your post." };
  await getDb()
    .update(discussionPost)
    .set({ body: body.data, spoiler: form.get("spoiler") === "on", editedAt: new Date() })
    .where(eq(discussionPost.id, found.post.id));
  revalidatePath(back);
  return { ok: Date.now() };
}

/** The author or an admin removes a post. A thread with replies stays as a "deleted" placeholder so the replies keep their place. */
export async function deletePostAction(form: FormData): Promise<void> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  const found = await loadPost(user, form.get("postId"));
  if (!found || (found.post.userId !== user.id && user.role !== "admin")) return;
  const db = getDb();
  const [replies] = await db.select({ n: count() }).from(discussionPost).where(eq(discussionPost.parentId, found.post.id));
  if (found.post.parentId === null && (replies?.n ?? 0) > 0) {
    await db.update(discussionPost).set({ status: "deleted", body: "", spoiler: false }).where(eq(discussionPost.id, found.post.id));
  } else {
    await db.delete(discussionPost).where(eq(discussionPost.id, found.post.id));
  }
  revalidatePath(back);
}

export async function toggleVoteAction(form: FormData): Promise<void> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  if (await examBlocked(user)) return;
  const found = await loadPost(user, form.get("postId"));
  if (!found || found.post.userId === user.id || found.post.status !== "visible") return;
  const db = getDb();
  const removed = await db
    .delete(discussionVote)
    .where(and(eq(discussionVote.postId, found.post.id), eq(discussionVote.userId, user.id)))
    .returning({ p: discussionVote.postId });
  if (removed.length === 0) await db.insert(discussionVote).values({ postId: found.post.id, userId: user.id }).onConflictDoNothing();
  revalidatePath(back);
}

/** The thread's author (or an admin) accepts a reply as the answer, or takes the mark back. One accepted reply per thread. */
export async function toggleAcceptAction(form: FormData): Promise<void> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  if (await examBlocked(user)) return;
  const found = await loadPost(user, form.get("postId"));
  if (!found || found.post.parentId === null || found.post.status !== "visible") return;
  const db = getDb();
  const [root] = await db.select().from(discussionPost).where(eq(discussionPost.id, found.post.parentId));
  if (!root || !canAccept(user, root.userId)) return;
  const accept = !found.post.accepted;
  await db.transaction(async (tx) => {
    await tx.update(discussionPost).set({ accepted: false }).where(and(eq(discussionPost.parentId, root.id), ne(discussionPost.id, found.post.id)));
    await tx.update(discussionPost).set({ accepted: accept }).where(eq(discussionPost.id, found.post.id));
  });
  if (accept && found.post.userId !== user.id) {
    after(() =>
      notify({ kind: "accepted", target: found.info, actor: user, body: found.post.body, spoiler: found.post.spoiler, recipientId: found.post.userId }).catch((e) =>
        console.error("[discussions] notify failed:", e),
      ),
    );
  }
  revalidatePath(back);
}

export async function toggleFollowAction(form: FormData): Promise<void> {
  const back = safeBack(form.get("back"));
  const user = await requireUser(back);
  const t = target(form);
  if (!t || !(await describeTarget(t.type, t.id, user))) return;
  const db = getDb();
  const where = and(eq(discussionFollow.userId, user.id), eq(discussionFollow.targetType, t.type), eq(discussionFollow.targetId, t.id));
  const removed = await db.delete(discussionFollow).where(where).returning({ u: discussionFollow.userId });
  if (removed.length === 0) await db.insert(discussionFollow).values({ userId: user.id, targetType: t.type, targetId: t.id }).onConflictDoNothing();
  revalidatePath(back);
}

export interface ReportState {
  sent?: boolean;
  error?: string;
}

/** Reports a post to the moderators. Reports from AUTO_HIDE_REPORTS learners hide it until an admin decides. */
export async function reportPostAction(_prev: ReportState, form: FormData): Promise<ReportState> {
  const user = await requireUser("/today");
  const found = await loadPost(user, form.get("postId"));
  if (!found || found.post.status === "deleted") return { error: "That post is no longer there." };
  if (found.post.userId === user.id) return { error: "You cannot report your own post. Edit or delete it instead." };
  const parsed = z
    .object({ reason: z.enum(REPORT_REASON_VALUES), details: z.string().max(2000).optional() })
    .safeParse({ reason: form.get("reason"), details: String(form.get("details") ?? "").trim() || undefined });
  if (!parsed.success) return { error: "Choose what is wrong." };
  const db = getDb();
  await db
    .insert(discussionReport)
    .values({ postId: found.post.id, userId: user.id, reason: parsed.data.reason, details: parsed.data.details ?? null })
    .onConflictDoNothing();
  const [open] = await db
    .select({ n: count() })
    .from(discussionReport)
    .where(and(eq(discussionReport.postId, found.post.id), eq(discussionReport.status, "open")));
  if ((open?.n ?? 0) >= AUTO_HIDE_REPORTS && found.post.status === "visible") {
    await db.update(discussionPost).set({ status: "hidden", hiddenReason: "reports" }).where(eq(discussionPost.id, found.post.id));
  }
  revalidatePath(safeBack(form.get("back")));
  return { sent: true };
}

const Moderation = z.enum(["hide", "restore", "dismiss", "mark-spoiler", "delete"]);

/**
 * Admin moderation, from the queue or the discussion itself: hide (or restore) a post, mark it as a spoiler, delete
 * it, or dismiss its reports. Every choice except "hide" without reports resolves the post's open reports.
 */
export async function moderatePostAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const back = safeBack(form.get("back"), "/admin/discussions");
  const action = Moderation.parse(form.get("action"));
  const found = await loadPost(admin, form.get("postId"));
  if (!found) return;
  const db = getDb();
  const id = found.post.id;
  if (action === "hide") await db.update(discussionPost).set({ status: "hidden", hiddenReason: "moderator" }).where(eq(discussionPost.id, id));
  if (action === "restore") await db.update(discussionPost).set({ status: "visible", hiddenReason: null }).where(eq(discussionPost.id, id));
  if (action === "mark-spoiler") await db.update(discussionPost).set({ spoiler: true, status: "visible", hiddenReason: null }).where(eq(discussionPost.id, id));
  if (action === "delete") await db.delete(discussionPost).where(eq(discussionPost.id, id));
  if (action !== "delete") {
    await db
      .update(discussionReport)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(and(eq(discussionReport.postId, id), eq(discussionReport.status, "open")));
  }
  revalidatePath(back);
  revalidatePath("/admin/discussions");
}

export interface EmailPrefState {
  ok?: boolean;
}

export async function setDiscussionEmailsAction(_prev: EmailPrefState, form: FormData): Promise<EmailPrefState> {
  const user = await requireUser("/account");
  const on = form.get("notify") === "on";
  await getDb()
    .insert(profile)
    .values({ userId: user.id, notifyDiscussions: on })
    .onConflictDoUpdate({ target: profile.userId, set: { notifyDiscussions: on, updatedAt: new Date() } });
  revalidatePath("/account");
  return { ok: true };
}
