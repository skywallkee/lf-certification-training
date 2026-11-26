import { BadgeCheck, Bell, BellOff, CheckCircle2, ShieldAlert, ThumbsUp } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deletePostAction, moderatePostAction, toggleAcceptAction, toggleFollowAction, toggleVoteAction } from "@/app/actions/discussions";
import { CodeBlock } from "@/components/code-block";
import { LocalTime } from "@/components/local-time";
import { buttonVariants } from "@/components/ui/button";
import { canAccept, discussPath, startsFolded, type TargetType, type ViewPost } from "@/lib/discussions";
import { rehypeHighlightPlugin } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { describeTarget, getActiveExam, loadDiscussion, viewerHasDone } from "@/server/discussions";
import type { SessionUser } from "@/server/session";
import { FoldedDiscussion, PostForm, ReportButton, SpoilerBody } from "./discussion-client";

/** Learner-written Markdown: no raw HTML, no images (no tracking pixels), links marked as user content. */
export function PostMarkdown({ children }: { children: string }) {
  return (
    <div className="md-inline text-[15px] leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlightPlugin]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="nofollow ugc noreferrer">
              {c}
            </a>
          ),
          img: ({ alt, src }) => (typeof src === "string" ? <a href={src} target="_blank" rel="nofollow ugc noreferrer">{alt || "image link"}</a> : null),
          h1: "p",
          h2: "p",
          h3: "p",
          h4: "p",
          h5: "p",
          h6: "p",
          pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

const linkButton = "min-h-6 text-sm font-medium text-primary hover:underline disabled:opacity-50";

function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}

/**
 * The discussion under a lesson, question, lab or mock exam task (ADR 0022). Server-rendered; the forms post to
 * server actions and work without JavaScript, except the spoiler folds and the report dialog.
 *
 * While the viewer has an exam-mode mock running, nothing of any discussion is sent to the browser.
 */
export async function Discussion({
  targetType,
  targetId,
  viewer,
  back,
  title = "Discussion",
  anchor = "discussion",
}: {
  targetType: TargetType;
  targetId: string;
  viewer: SessionUser | null;
  back: string;
  title?: string;
  anchor?: string;
}) {
  const headingId = `${anchor}-heading`;
  const shell = (children: React.ReactNode, count?: number, extra?: React.ReactNode) => (
    <section id={anchor} aria-labelledby={headingId} className="flex max-w-[72ch] scroll-mt-20 flex-col gap-4 rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
          {count !== undefined ? <span className="ml-2 font-normal text-muted-foreground">({count})</span> : null}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );

  if (!viewer) {
    return shell(
      <p className="text-[15px] text-muted-foreground">
        Learners ask and answer questions here.{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(back)}`}>Sign in to read and join the discussion</Link>.
      </p>,
    );
  }
  const exam = await getActiveExam(viewer.id);
  if (exam) {
    return shell(
      <p className="flex items-start gap-2 text-[15px]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <span>
          Discussions are hidden while your mock exam runs, so the exam stays fair. <Link href={exam.href}>Back to the exam</Link>.
        </span>
      </p>,
    );
  }
  const info = await describeTarget(targetType, targetId, viewer);
  if (!info) return null;
  const [{ threads, following, total }, done] = await Promise.all([loadDiscussion(targetType, targetId, viewer), viewerHasDone(targetType, targetId, viewer.id)]);
  const admin = viewer.role === "admin";
  const t = { targetType, targetId, back };

  const followForm = (
    <form action={toggleFollowAction}>
      <Hidden name="targetType" value={targetType} />
      <Hidden name="targetId" value={targetId} />
      <Hidden name="back" value={back} />
      <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-pressed={following}>
        {following ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {following ? "Unfollow" : "Follow"}
      </button>
    </form>
  );

  const post = (p: ViewPost, rootAuthor: string, isReply: boolean) => {
    const by = p.authorRole === "admin" ? `${p.authorName} · admin` : p.authorName;
    return (
      <article
        id={`post-${p.id}`}
        aria-label={`${isReply ? "Reply" : "Post"} by ${p.authorName}`}
        className={cn("flex scroll-mt-20 flex-col gap-2", isReply && "border-l-2 pl-4", p.accepted && "border-success")}
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {p.status === "deleted" ? <span className="text-muted-foreground">Deleted post</span> : <span className="font-semibold">{by}</span>}
          <span className="text-muted-foreground">
            <LocalTime value={p.createdAt} />
            {p.editedAt ? " · edited" : ""}
          </span>
          {p.accepted ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <BadgeCheck aria-hidden="true" className="size-4" /> Accepted answer
            </span>
          ) : null}
          {p.status === "hidden" ? (
            <span className="font-medium text-warning">
              {p.hiddenReason === "reports" ? "Hidden after reports, waiting for a moderator" : "Hidden by a moderator"}
              {p.mine && !admin ? " · only you can see it" : ""}
            </span>
          ) : null}
        </header>
        {p.status === "deleted" ? (
          <p className="text-[15px] italic text-muted-foreground">The author deleted this post.</p>
        ) : p.spoiler ? (
          <SpoilerBody postId={p.id}>
            <PostMarkdown>{p.body}</PostMarkdown>
          </SpoilerBody>
        ) : (
          <PostMarkdown>{p.body}</PostMarkdown>
        )}
        {p.status !== "deleted" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <form action={toggleVoteAction}>
              <Hidden name="postId" value={p.id} />
              <Hidden name="back" value={back} />
              <button
                type="submit"
                className={cn("inline-flex min-h-6 items-center gap-1.5 text-sm font-medium", p.votedByMe ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                aria-pressed={p.votedByMe}
                disabled={p.mine || p.status !== "visible"}
                title={p.mine ? "You cannot vote on your own post" : undefined}
              >
                <ThumbsUp aria-hidden="true" className="size-4" />
                <span>
                  {p.votes}
                  <span className="sr-only"> {p.votes === 1 ? "vote" : "votes"}, </span>
                  <span className="sr-only">{p.votedByMe ? "remove your vote" : "helpful"}</span>
                </span>
              </button>
            </form>
            {isReply && p.status === "visible" && canAccept(viewer, rootAuthor) ? (
              <form action={toggleAcceptAction}>
                <Hidden name="postId" value={p.id} />
                <Hidden name="back" value={back} />
                <button type="submit" className={cn(linkButton, "inline-flex items-center gap-1")}>
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {p.accepted ? "Unaccept" : "Accept as answer"}
                </button>
              </form>
            ) : null}
            {p.mine ? (
              <details className="group">
                <summary className={cn(linkButton, "cursor-pointer list-none")}>Edit</summary>
                <div className="mt-2 w-full min-w-[min(100%,28rem)]">
                  <PostForm {...t} postId={p.id} defaultBody={p.body} defaultSpoiler={p.spoiler} label="Edit your post" submitLabel="Save" idPrefix={`edit-${p.id}`} />
                </div>
              </details>
            ) : null}
            {p.mine || admin ? (
              <form action={deletePostAction}>
                <Hidden name="postId" value={p.id} />
                <Hidden name="back" value={back} />
                <button type="submit" className={cn(linkButton, "text-destructive")}>
                  Delete
                </button>
              </form>
            ) : null}
            {!p.mine && p.status === "visible" ? <ReportButton postId={p.id} back={back} /> : null}
            {admin ? (
              <form action={moderatePostAction} className="flex items-center gap-3">
                <Hidden name="postId" value={p.id} />
                <Hidden name="back" value={back} />
                {p.status === "hidden" ? (
                  <button type="submit" name="action" value="restore" className={linkButton}>
                    Restore
                  </button>
                ) : (
                  <button type="submit" name="action" value="hide" className={linkButton}>
                    Hide
                  </button>
                )}
                {!p.spoiler ? (
                  <button type="submit" name="action" value="mark-spoiler" className={linkButton}>
                    Mark as spoiler
                  </button>
                ) : null}
              </form>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  const list =
    threads.length === 0 ? (
      <p className="text-[15px] text-muted-foreground">No posts yet. Stuck, or found a trick worth sharing? Start the discussion.</p>
    ) : (
      <ol className="flex flex-col gap-6" aria-label="Threads">
        {threads.map((root) => (
          <li key={root.id} className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
            {post(root, root.userId, false)}
            {root.replies.length > 0 ? (
              <ol className="ml-2 flex flex-col gap-4 sm:ml-6" aria-label={`Replies to ${root.status === "deleted" ? "a deleted post" : root.authorName}`}>
                {root.replies.map((r) => (
                  <li key={r.id}>{post(r, root.userId, true)}</li>
                ))}
              </ol>
            ) : null}
            {root.status !== "deleted" ? (
              <details className="ml-2 sm:ml-6">
                <summary className={cn(linkButton, "cursor-pointer")}>Reply</summary>
                <div className="mt-2">
                  <PostForm {...t} parentId={root.id} label={`Reply to ${root.authorName}`} submitLabel="Post reply" idPrefix={`reply-${root.id}`} />
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    );

  const body = (
    <>
      {list}
      <details className="rounded-md border p-4" open={threads.length === 0}>
        <summary className="cursor-pointer text-[15px] font-medium">Start a new thread</summary>
        <div className="mt-3">
          <PostForm
            {...t}
            label="Your question or tip"
            submitLabel="Post"
            idPrefix={`new-${anchor}`}
            hint="Be kind and specific. Mark solutions as spoilers. Never share real exam questions. Markdown works; your name is shown."
          />
        </div>
      </details>
    </>
  );

  const message =
    targetType === "question"
      ? "This discussion talks about the answer. Answer the question first so it does not spoil it."
      : "This discussion talks about how to solve the task. Take the mock exam first so it does not spoil it.";

  return shell(
    <>
      {startsFolded(targetType, done) ? <FoldedDiscussion message={message}>{body}</FoldedDiscussion> : body}
      {back !== discussPath(targetType, targetId) && threads.length > 0 ? (
        <p className="text-sm">
          <Link href={discussPath(targetType, targetId)}>Open the discussion on its own page</Link>
        </p>
      ) : null}
    </>,
    total,
    followForm,
  );
}
