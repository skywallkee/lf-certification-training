import "server-only";
import { and, count, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { lab as labTable, lesson as lessonTable, question as questionTable } from "@lfct/curriculum/db";
import { getDb } from "@/db";
import { answer, discussionFollow, discussionPost, discussionVote, labSession, profile, quiz, reminderSent, user as userTable } from "@/db/schema";
import { env } from "@/env";
import {
  EMAIL_THROTTLE_MS,
  buildThreads,
  discussPath,
  notificationEmail,
  pickActiveExam,
  type ActiveExam,
  type NotifyKind,
  type PostRow,
  type TargetType,
  type ViewPost,
  type Viewer,
} from "@/lib/discussions";
import { competencyPath } from "./catalog";
import { sendEmail } from "./email";
import { discussionsUnsubscribeUrl, discussionsOneClickUrl } from "./unsubscribe";

export interface TargetInfo {
  type: TargetType;
  id: string;
  /** "Lesson: Rolling updates", used in headings and emails. */
  label: string;
  /** Short title of the item itself. */
  title: string;
  /** Where the item lives in the app (the discussion page for questions and mock tasks, which have no page of their own). */
  href: string;
  /** Question stem or mock task text, shown above a discussion on its own page. */
  context?: string;
  /** Mock tasks: the mock exam's id. */
  mockId?: string;
}

function shorten(s: string, max = 90): string {
  const flat = s.replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** The target if it exists and the viewer may open it (drafts only for admins), otherwise null. */
export async function describeTarget(type: TargetType, id: string, viewer: Viewer): Promise<TargetInfo | null> {
  const db = getDb();
  const admin = viewer.role === "admin";
  if (type === "lesson") {
    const [l] = await db.select().from(lessonTable).where(eq(lessonTable.id, id));
    if (!l || (!l.published && !admin)) return null;
    const ref = l.competencyRefs[0];
    const href = ref ? `${competencyPath(ref)}#discussion-lesson-${l.id}` : "/certs";
    return { type, id, label: `Lesson: ${l.title}`, title: l.title, href };
  }
  if (type === "question") {
    const [q] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (!q || (!q.published && !admin)) return null;
    const title = shorten(q.stem);
    return { type, id, label: `${q.certCode} question: ${title}`, title, href: discussPath(type, id), context: q.stem };
  }
  if (type === "lab") {
    const [l] = await db.select().from(labTable).where(eq(labTable.id, id));
    if (!l || l.kind !== "lab" || (!l.published && !admin)) return null;
    return { type, id, label: `Lab: ${l.title}`, title: l.title, href: `/labs/${l.id}#discussion` };
  }
  const [mockId, taskId] = id.split("/");
  const [m] = await db.select().from(labTable).where(eq(labTable.id, mockId!));
  if (!m || m.kind !== "mock" || (!m.published && !admin)) return null;
  const index = m.tasks.findIndex((t) => t.id === taskId);
  if (index < 0) return null;
  const task = m.tasks[index]!;
  return {
    type,
    id,
    label: `${m.title}, task ${index + 1}: ${task.title}`,
    title: `Task ${index + 1}: ${task.title}`,
    href: discussPath(type, id),
    context: task.body,
    mockId: m.id,
  };
}

/** The learner's running exam-mode attempt, during which discussions are hidden from them. */
export async function getActiveExam(userId: string): Promise<ActiveExam | null> {
  const db = getDb();
  const now = new Date();
  const [sessions, quizzes] = await Promise.all([
    db
      .select({ id: labSession.id, mode: labSession.mode, status: labSession.status })
      .from(labSession)
      .where(and(eq(labSession.userId, userId), eq(labSession.mode, "exam"), inArray(labSession.status, ["requested", "booting", "ready"]))),
    db
      .select({ id: quiz.id, finishedAt: quiz.finishedAt, expiresAt: quiz.expiresAt })
      .from(quiz)
      .where(and(eq(quiz.userId, userId), eq(quiz.kind, "mock"), isNull(quiz.finishedAt), gt(quiz.expiresAt, now))),
  ]);
  return pickActiveExam(sessions, quizzes, now);
}

/** Whether the viewer has answered the question, or finished an attempt of the mock (for the spoiler fold). */
export async function viewerHasDone(type: TargetType, id: string, userId: string): Promise<boolean> {
  const db = getDb();
  if (type === "question") {
    const [row] = await db.select({ id: answer.id }).from(answer).where(and(eq(answer.userId, userId), eq(answer.questionId, id))).limit(1);
    return Boolean(row);
  }
  if (type === "mock-task") {
    const [row] = await db
      .select({ id: labSession.id })
      .from(labSession)
      .where(
        and(
          eq(labSession.userId, userId),
          eq(labSession.labId, id.split("/")[0]!),
          isNotNull(labSession.startedAt),
          inArray(labSession.status, ["finished", "expired", "killed", "failed"]),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  return true;
}

export interface LoadedDiscussion {
  threads: ViewPost[];
  following: boolean;
  total: number;
}

export async function loadDiscussion(type: TargetType, id: string, viewer: Viewer): Promise<LoadedDiscussion> {
  const db = getDb();
  const votes = db
    .select({ postId: discussionVote.postId, n: count().as("n") })
    .from(discussionVote)
    .groupBy(discussionVote.postId)
    .as("votes");
  const [rows, mine, follow] = await Promise.all([
    db
      .select({
        id: discussionPost.id,
        parentId: discussionPost.parentId,
        userId: discussionPost.userId,
        authorName: userTable.name,
        authorRole: sql<string>`coalesce(${userTable.role}, 'user')`,
        body: discussionPost.body,
        spoiler: discussionPost.spoiler,
        accepted: discussionPost.accepted,
        status: discussionPost.status,
        hiddenReason: discussionPost.hiddenReason,
        createdAt: discussionPost.createdAt,
        editedAt: discussionPost.editedAt,
        votes: sql<number>`coalesce(${votes.n}, 0)::int`,
      })
      .from(discussionPost)
      .innerJoin(userTable, eq(userTable.id, discussionPost.userId))
      .leftJoin(votes, eq(votes.postId, discussionPost.id))
      .where(and(eq(discussionPost.targetType, type), eq(discussionPost.targetId, id))),
    db
      .select({ postId: discussionVote.postId })
      .from(discussionVote)
      .innerJoin(discussionPost, eq(discussionPost.id, discussionVote.postId))
      .where(and(eq(discussionVote.userId, viewer.id), eq(discussionPost.targetType, type), eq(discussionPost.targetId, id))),
    db
      .select({ u: discussionFollow.userId })
      .from(discussionFollow)
      .where(and(eq(discussionFollow.userId, viewer.id), eq(discussionFollow.targetType, type), eq(discussionFollow.targetId, id))),
  ]);
  const threads = buildThreads(rows as PostRow[], viewer, new Set(mine.map((m) => m.postId)));
  return { threads, following: follow.length > 0, total: rows.filter((r) => r.status === "visible").length };
}

/** Visible posts per target id, for "Discussion (n)" links. */
export async function discussionCounts(type: TargetType, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: discussionPost.targetId, n: count() })
    .from(discussionPost)
    .where(and(eq(discussionPost.targetType, type), inArray(discussionPost.targetId, ids), eq(discussionPost.status, "visible")))
    .groupBy(discussionPost.targetId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * Emails the people a new post concerns: followers of the discussion for a new thread or reply, the reply's author
 * when it is accepted. Skips the actor, unverified addresses and anyone who turned discussion emails off, and
 * sends a follower at most one email per discussion an hour (keys in reminder_sent).
 */
export async function notify(args: { kind: NotifyKind; target: TargetInfo; actor: { id: string; name: string }; body: string; spoiler: boolean; recipientId?: string }) {
  const db = getDb();
  const { kind, target, actor } = args;
  const base = db
    .select({ id: userTable.id, email: userTable.email, verified: userTable.emailVerified, on: sql<boolean>`coalesce(${profile.notifyDiscussions}, true)` })
    .from(userTable)
    .leftJoin(profile, eq(profile.userId, userTable.id));
  const recipients =
    kind === "accepted"
      ? args.recipientId
        ? await base.where(eq(userTable.id, args.recipientId))
        : []
      : await base.innerJoin(
          discussionFollow,
          and(eq(discussionFollow.userId, userTable.id), eq(discussionFollow.targetType, target.type), eq(discussionFollow.targetId, target.id)),
        );
  const url = `${env.baseUrl}${discussPath(target.type, target.id)}`;
  const bucket = Math.floor(Date.now() / EMAIL_THROTTLE_MS);
  for (const r of recipients) {
    if (r.id === actor.id || !r.verified || !r.on) continue;
    if (kind !== "accepted") {
      const key = `discussion:${target.type}:${target.id}:${bucket}`;
      const inserted = await db.insert(reminderSent).values({ userId: r.id, key }).onConflictDoNothing().returning({ k: reminderSent.key });
      if (inserted.length === 0) continue;
    }
    const mail = notificationEmail({ kind, author: actor.name, label: target.label, body: args.body, spoiler: args.spoiler, url, unsubscribeUrl: discussionsUnsubscribeUrl(r.id) });
    await sendEmail({
      to: r.email,
      ...mail,
      headers: { "List-Unsubscribe": `<${discussionsOneClickUrl(r.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  }
}
