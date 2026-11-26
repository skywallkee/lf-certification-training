"use client";

import { Eye, Flag } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createPostAction, editPostAction, reportPostAction, type PostFormState, type ReportState } from "@/app/actions/discussions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, FieldHint, Label, Select, Textarea } from "@/components/ui/field";
import { BODY_MAX, REPORT_REASONS } from "@/lib/discussions";

interface TargetProps {
  targetType: string;
  targetId: string;
  back: string;
}

/** New thread, reply (parentId) or edit (postId) form. Clears itself after a successful post. */
export function PostForm({
  targetType,
  targetId,
  back,
  parentId,
  postId,
  defaultBody = "",
  defaultSpoiler = false,
  label,
  submitLabel,
  idPrefix,
  hint,
}: TargetProps & {
  parentId?: number;
  postId?: number;
  defaultBody?: string;
  defaultSpoiler?: boolean;
  label: string;
  submitLabel: string;
  idPrefix: string;
  hint?: string;
}) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(postId ? editPostAction : createPostAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !postId) formRef.current?.reset();
  }, [state.ok, postId]);
  const bodyId = `${idPrefix}-body`;
  const errorId = `${idPrefix}-error`;
  const hintId = `${idPrefix}-hint`;
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="back" value={back} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {postId ? <input type="hidden" name="postId" value={postId} /> : null}
      <Label htmlFor={bodyId}>{label}</Label>
      <Textarea
        id={bodyId}
        name="body"
        required
        minLength={2}
        maxLength={BODY_MAX}
        defaultValue={defaultBody}
        rows={postId || parentId ? 3 : 4}
        aria-describedby={`${hintId}${state.error ? ` ${errorId}` : ""}`}
        aria-invalid={state.error ? true : undefined}
      />
      <FieldHint id={hintId}>{hint ?? "Markdown works: `code`, ```blocks```, lists and links. Your name is shown with the post."}</FieldHint>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="spoiler" defaultChecked={defaultSpoiler} className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
        <span>
          Spoiler: this shows a solution or the answer
          <span className="block text-muted-foreground">Readers see it folded until they choose to open it.</span>
        </span>
      </label>
      {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}
      {state.ok && !state.error ? (
        <p role="status" className="text-sm font-medium text-success">
          {postId ? "Saved." : "Posted."}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A post marked as a spoiler: folded until the reader opens it. */
export function SpoilerBody({ children, postId }: { children: ReactNode; postId: number }) {
  const [open, setOpen] = useState(false);
  const id = `spoiler-${postId}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-warning bg-warning-soft px-3 py-2 text-sm">
        <span>Spoiler: this post shows a solution.</span>
        <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <Eye aria-hidden="true" />
          {open ? "Hide spoiler" : "Show spoiler"}
        </Button>
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** A whole discussion folded away because it talks about an answer the reader has not given yet. */
export function FoldedDiscussion({ children, message }: { children: ReactNode; message: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed bg-muted/50 p-4 text-[15px]">
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Eye aria-hidden="true" />
        Show the discussion anyway
      </Button>
    </div>
  );
}

/** Report a post to the moderators. */
export function ReportButton({ postId, back }: { postId: number; back: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportState, FormData>(reportPostAction, {});
  const reasonId = `report-reason-${postId}`;
  const detailsId = `report-details-${postId}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="link" size="sm" className="min-h-6 text-muted-foreground">
          <Flag aria-hidden="true" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Report this post</DialogTitle>
        {state.sent ? (
          <>
            <DialogDescription>Thanks. A moderator will look at it.</DialogDescription>
            <div className="mt-4 flex justify-end">
              <DialogClose asChild>
                <Button type="button">Close</Button>
              </DialogClose>
            </div>
          </>
        ) : (
          <form action={action} className="mt-4 flex flex-col gap-4">
            <DialogDescription className="mt-0">A moderator reads every report and decides what happens to the post.</DialogDescription>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="back" value={back} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={reasonId}>What is wrong</Label>
              <Select id={reasonId} name="reason" defaultValue="spoiler">
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={detailsId}>Details (optional)</Label>
              <Textarea id={detailsId} name="details" maxLength={2000} />
            </div>
            {state.error ? <FieldError>{state.error}</FieldError> : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                Send report
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
