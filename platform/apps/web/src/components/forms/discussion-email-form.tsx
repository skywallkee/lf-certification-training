"use client";

import { useActionState } from "react";
import { setDiscussionEmailsAction, type EmailPrefState } from "@/app/actions/discussions";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/field";

export function DiscussionEmailForm({ on, verified }: { on: boolean; verified: boolean }) {
  const [state, action, pending] = useActionState<EmailPrefState, FormData>(setDiscussionEmailsAction, {});
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="notify" defaultChecked={on} aria-describedby="discussion-email-hint" className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
        <span>
          Email me about discussions I follow
          <span className="block text-sm text-muted-foreground">New threads and replies (at most one email per discussion an hour), and when my reply is accepted.</span>
        </span>
      </label>
      <FieldHint id="discussion-email-hint">
        Posting in a discussion follows it; unfollow it from the discussion. Every email has a link to stop them.
        {verified ? "" : " Emails go out once your email address is verified."}
      </FieldHint>
      {state.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          Saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
