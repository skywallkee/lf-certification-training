/**
 * Community discussion rules that need no database (ADR 0022): which targets exist, how a discussion is ordered,
 * what a viewer may see of each post, when a discussion starts folded away as a spoiler, and the notification text.
 */

export const TARGET_TYPES = ["lesson", "question", "lab", "mock-task"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const BODY_MAX = 5000;
export const BODY_MIN = 2;
/** Open reports from this many learners hide a post until a moderator looks at it. */
export const AUTO_HIDE_REPORTS = 3;
/** Posts (threads and replies) a learner may write in POST_WINDOW_MS. */
export const POST_LIMIT = { max: 10, windowMs: 10 * 60_000 };
/** A follower gets at most one email per discussion in this window, however many posts arrive. */
export const EMAIL_THROTTLE_MS = 60 * 60_000;

export const REPORT_REASONS = [
  { value: "spoiler", label: "Shows a solution without a spoiler mark" },
  { value: "wrong", label: "Wrong or misleading" },
  { value: "rude", label: "Rude or harassing" },
  { value: "spam", label: "Spam or advertising" },
  { value: "exam-content", label: "Shares real exam questions" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]];

export function isTargetType(value: unknown): value is TargetType {
  return typeof value === "string" && (TARGET_TYPES as readonly string[]).includes(value);
}

/** Content ids are slugs; a mock exam task is "<mock id>/<task id>". */
const ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
export function isTargetId(type: TargetType, id: string): boolean {
  if (type === "mock-task") {
    const parts = id.split("/");
    return parts.length === 2 && parts.every((p) => ID.test(p));
  }
  return ID.test(id);
}

/** The discussion page for a target. */
export function discussPath(type: TargetType, id: string): string {
  return `/discuss/${type}/${id.split("/").map(encodeURIComponent).join("/")}`;
}

/** A `back` path from a form: same-site paths only. */
export function safeBack(value: unknown, fallback = "/today"): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && s.length <= 300 ? s : fallback;
}

export interface PostRow {
  id: number;
  parentId: number | null;
  userId: string;
  authorName: string;
  authorRole: string;
  body: string;
  spoiler: boolean;
  accepted: boolean;
  status: "visible" | "hidden" | "deleted";
  hiddenReason: string | null;
  createdAt: Date;
  editedAt: Date | null;
  votes: number;
}

export interface Viewer {
  id: string;
  role: string;
}

/** A post as the viewer may see it: hidden and deleted posts lose their body unless the viewer may still read it. */
export interface ViewPost extends PostRow {
  /** The body is shown (false for a deleted post, or a hidden one the viewer is not allowed to read). */
  readable: boolean;
  mine: boolean;
  votedByMe: boolean;
  replies: ViewPost[];
}

/**
 * Orders a discussion: threads with the most votes first (newest first on a tie); in a thread the accepted reply
 * comes first, then replies oldest first so the conversation reads in order. Hidden posts are left out for
 * learners unless they wrote them; deleted posts stay as placeholders only while they have replies.
 */
export function buildThreads(rows: PostRow[], viewer: Viewer, myVotes: Set<number>): ViewPost[] {
  const admin = viewer.role === "admin";
  const view = (r: PostRow): ViewPost => {
    const mine = r.userId === viewer.id;
    const readable = r.status === "visible" || (r.status === "hidden" && (admin || mine));
    return { ...r, body: readable ? r.body : "", readable, mine, votedByMe: myVotes.has(r.id), replies: [] };
  };
  const shown = (r: PostRow) => r.status !== "hidden" || admin || r.userId === viewer.id;
  const roots = rows.filter((r) => r.parentId === null && shown(r)).map(view);
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const r of rows) {
    if (r.parentId === null || !shown(r) || r.status === "deleted") continue;
    byId.get(r.parentId)?.replies.push(view(r));
  }
  for (const root of roots) {
    root.replies.sort((a, b) => Number(b.accepted) - Number(a.accepted) || a.createdAt.getTime() - b.createdAt.getTime());
  }
  return roots
    .filter((r) => r.status !== "deleted" || r.replies.length > 0)
    .sort((a, b) => b.votes - a.votes || b.createdAt.getTime() - a.createdAt.getTime());
}

/** Posts counted on "Discussion (n)" links: visible threads and replies. */
export function countVisible(rows: Pick<PostRow, "status">[]): number {
  return rows.filter((r) => r.status === "visible").length;
}

/**
 * Whether a discussion opens folded away behind "show anyway": question and mock task discussions talk about the
 * answer, so they start folded for a learner who has not answered the question or finished an attempt of the mock.
 * Lessons and labs are open (a lab's discussion is about doing it, and its reference solution is public anyway).
 */
export function startsFolded(type: TargetType, viewerHasDone: boolean): boolean {
  return (type === "question" || type === "mock-task") && !viewerHasDone;
}

export interface ActiveExam {
  kind: "practical" | "multiple-choice";
  href: string;
}

/**
 * The learner's exam-mode attempt that is still running, if any. While one runs every discussion is hidden from
 * them (not only the mock's own), so an exam cannot be answered from the community.
 */
export function pickActiveExam(
  sessions: { id: string; mode: string; status: string }[],
  quizzes: { id: string; finishedAt: Date | null; expiresAt: Date | null }[],
  now: Date,
): ActiveExam | null {
  const s = sessions.find((x) => x.mode === "exam" && ["requested", "booting", "ready"].includes(x.status));
  if (s) return { kind: "practical", href: `/mocks/attempts/${s.id}` };
  const q = quizzes.find((x) => x.finishedAt === null && x.expiresAt !== null && x.expiresAt > now);
  if (q) return { kind: "multiple-choice", href: `/mocks/quiz/${q.id}` };
  return null;
}

/** Can the viewer accept a reply in this thread: the thread's author, or an admin. */
export function canAccept(viewer: Viewer, rootAuthorId: string): boolean {
  return viewer.role === "admin" || viewer.id === rootAuthorId;
}

/** First lines of a post for an email: plain, short, and nothing from a spoiler. */
export function excerpt(body: string, spoiler: boolean, max = 280): string {
  if (spoiler) return "(Marked as a spoiler: open the discussion to read it.)";
  const flat = body.replace(/```[\s\S]*?```/g, "[code]").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export type NotifyKind = "thread" | "reply" | "accepted";

export function notificationEmail(args: {
  kind: NotifyKind;
  author: string;
  label: string;
  body: string;
  spoiler: boolean;
  url: string;
  unsubscribeUrl: string;
}): { subject: string; text: string } {
  const { kind, author, label, url } = args;
  const subject =
    kind === "accepted" ? `Your answer was accepted: ${label}` : kind === "reply" ? `New reply: ${label}` : `New discussion: ${label}`;
  const lead =
    kind === "accepted"
      ? `${author} accepted your reply as the answer in the discussion on ${label}.`
      : kind === "reply"
        ? `${author} replied in the discussion on ${label}:`
        : `${author} started a discussion on ${label}:`;
  const lines = [lead, ""];
  if (kind !== "accepted") lines.push(excerpt(args.body, args.spoiler), "");
  lines.push(`Open the discussion: ${url}`, "");
  lines.push(
    kind === "accepted"
      ? "You get this because you wrote the reply."
      : "You get this because you follow this discussion (posting in it follows it). Unfollow it from the discussion page.",
    `Stop all discussion emails: ${args.unsubscribeUrl}`,
  );
  return { subject, text: lines.join("\n") };
}
