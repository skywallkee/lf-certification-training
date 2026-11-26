import { desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { moderatePostAction } from "@/app/actions/discussions";
import { PostMarkdown } from "@/components/discussions/discussion";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { discussionPost, discussionReport, user as userTable } from "@/db/schema";
import { REPORT_REASONS, discussPath, type TargetType } from "@/lib/discussions";
import { cn } from "@/lib/utils";
import { describeTarget } from "@/server/discussions";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Discussions · Admin" };

const REASON = new Map<string, string>(REPORT_REASONS.map((r) => [r.value, r.label]));
const btn = "min-h-6 text-sm font-medium text-primary hover:underline";

/**
 * The moderation queue: posts with open reports (hidden ones first), and the newest posts so an admin can skim
 * what learners write. Actions resolve the post's reports.
 */
export default async function AdminDiscussionsPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const reports = await db
    .select({
      id: discussionReport.id,
      postId: discussionReport.postId,
      reason: discussionReport.reason,
      details: discussionReport.details,
      createdAt: discussionReport.createdAt,
      reporter: userTable.name,
    })
    .from(discussionReport)
    .leftJoin(userTable, eq(userTable.id, discussionReport.userId))
    .where(eq(discussionReport.status, "open"))
    .orderBy(desc(discussionReport.createdAt))
    .limit(200);
  const postIds = [...new Set(reports.map((r) => r.postId))];
  const postCols = {
    id: discussionPost.id,
    targetType: discussionPost.targetType,
    targetId: discussionPost.targetId,
    parentId: discussionPost.parentId,
    body: discussionPost.body,
    spoiler: discussionPost.spoiler,
    status: discussionPost.status,
    hiddenReason: discussionPost.hiddenReason,
    createdAt: discussionPost.createdAt,
    authorName: userTable.name,
    authorEmail: userTable.email,
  };
  const [reported, recent] = await Promise.all([
    postIds.length
      ? db.select(postCols).from(discussionPost).innerJoin(userTable, eq(userTable.id, discussionPost.userId)).where(inArray(discussionPost.id, postIds))
      : Promise.resolve([]),
    db
      .select(postCols)
      .from(discussionPost)
      .innerJoin(userTable, eq(userTable.id, discussionPost.userId))
      .where(inArray(discussionPost.status, ["visible", "hidden"]))
      .orderBy(desc(discussionPost.createdAt))
      .limit(30),
  ]);
  const labels = new Map<string, string>();
  for (const p of [...reported, ...recent]) {
    const k = `${p.targetType}:${p.targetId}`;
    if (!labels.has(k)) labels.set(k, (await describeTarget(p.targetType as TargetType, p.targetId, admin))?.label ?? `${p.targetType} ${p.targetId} (removed)`);
  }
  const queue = [...reported].sort((a, b) => Number(b.status === "hidden") - Number(a.status === "hidden") || b.createdAt.getTime() - a.createdAt.getTime());

  type P = (typeof recent)[number];
  const postBlock = (p: P) => (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-semibold">{p.authorName}</span>
        <span className="text-muted-foreground">{p.authorEmail}</span>
        <span className="text-muted-foreground">
          · <LocalTime value={p.createdAt} />
        </span>
        {p.parentId ? <span className="text-muted-foreground">· reply</span> : null}
        {p.spoiler ? <span className="font-medium text-warning">· spoiler</span> : null}
        {p.status === "hidden" ? (
          <span className="font-medium text-destructive">· hidden {p.hiddenReason === "reports" ? "after reports" : "by a moderator"}</span>
        ) : null}
      </p>
      <Link href={`${discussPath(p.targetType as TargetType, p.targetId)}#post-${p.id}`} className="text-sm">
        {labels.get(`${p.targetType}:${p.targetId}`)}
      </Link>
      <div className="max-h-48 overflow-y-auto rounded-md bg-muted/60 p-3">
        <PostMarkdown>{p.body}</PostMarkdown>
      </div>
      <form action={moderatePostAction} className="flex flex-wrap items-center gap-4">
        <input type="hidden" name="postId" value={p.id} />
        <input type="hidden" name="back" value="/admin/discussions" />
        {p.status === "hidden" ? (
          <button type="submit" name="action" value="restore" className={btn}>
            Restore<span className="sr-only"> post {p.id}</span>
          </button>
        ) : (
          <button type="submit" name="action" value="hide" className={btn}>
            Hide<span className="sr-only"> post {p.id}</span>
          </button>
        )}
        {!p.spoiler ? (
          <button type="submit" name="action" value="mark-spoiler" className={btn}>
            Mark as spoiler<span className="sr-only"> post {p.id}</span>
          </button>
        ) : null}
        <button type="submit" name="action" value="delete" className={cn(btn, "text-destructive")}>
          Delete<span className="sr-only"> post {p.id}</span>
        </button>
      </form>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Discussions"
        lead="Reported posts and the newest posts. A post reported by 3 learners is hidden until you decide."
        actions={
          <Link href="/admin" className="text-sm font-medium">
            Back to Admin
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="queue">
          <CardTitle id="queue">Reported posts ({queue.length})</CardTitle>
          {queue.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">No open reports. Learners use Report on a post.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {queue.map((p) => {
                const mine = reports.filter((r) => r.postId === p.id);
                return (
                  <li key={p.id} className="flex flex-col gap-3 py-4">
                    <ul className="flex flex-col gap-1 text-sm">
                      {mine.map((r) => (
                        <li key={r.id}>
                          <span className="font-semibold">{REASON.get(r.reason) ?? r.reason}</span>
                          <span className="text-muted-foreground"> · from {r.reporter ?? "a deleted account"}</span>
                          {r.details ? <span> · &ldquo;{r.details}&rdquo;</span> : null}
                        </li>
                      ))}
                    </ul>
                    {postBlock(p)}
                    <form action={moderatePostAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <input type="hidden" name="back" value="/admin/discussions" />
                      <button type="submit" name="action" value={p.status === "hidden" ? "restore" : "dismiss"} className={btn}>
                        {p.status === "hidden" ? "Keep it: restore and dismiss the reports" : "Keep it: dismiss the reports"}
                        <span className="sr-only"> for post {p.id}</span>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="recent">
          <CardTitle id="recent">Newest posts</CardTitle>
          {recent.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">Nobody has posted yet.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {recent.map((p) => (
                <li key={p.id} className="py-4">
                  {postBlock(p)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
