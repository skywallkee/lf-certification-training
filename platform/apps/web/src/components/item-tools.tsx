"use client";

import { Bookmark, BookmarkCheck, Flag } from "lucide-react";
import { useActionState, useState } from "react";
import { flagItemAction, saveNoteAction, toggleBookmarkAction } from "@/app/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Label, Select, Textarea } from "@/components/ui/field";

type Target = { targetType: "lesson" | "question"; targetId: string };

export function BookmarkButton({ targetType, targetId, saved, back }: Target & { saved: boolean; back: string }) {
  return (
    <form action={toggleBookmarkAction}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="back" value={back} />
      <Button type="submit" variant="outline" size="sm" aria-pressed={saved}>
        {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {saved ? "Saved" : "Save"}
      </Button>
    </form>
  );
}

export function NoteEditor({ targetType, targetId, body }: Target & { body: string }) {
  const [state, action, pending] = useActionState(saveNoteAction, {});
  const id = `note-${targetType}-${targetId}`;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <Label htmlFor={id}>Your private note</Label>
      <Textarea id={id} name="body" defaultValue={body} maxLength={5000} placeholder="Only you can see this." />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Save note
        </Button>
        {state.saved ? (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

const REASONS = [
  { value: "wrong-answer", label: "The marked answer is wrong" },
  { value: "unclear", label: "The wording is unclear" },
  { value: "broken-link", label: "A link is broken" },
  { value: "typo", label: "Typo or formatting" },
  { value: "other", label: "Something else" },
];

/** "Flag a problem" from the item itself; lands in the admin queue. */
export function FlagButton({ targetType, targetId, label = "Flag a problem" }: Target & { label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(flagItemAction, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="link" size="sm" className="min-h-6">
          <Flag aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Flag a problem</DialogTitle>
        {state.sent ? (
          <>
            <DialogDescription>Thanks. An admin will look at it.</DialogDescription>
            <div className="mt-4 flex justify-end">
              <DialogClose asChild>
                <Button type="button">Close</Button>
              </DialogClose>
            </div>
          </>
        ) : (
          <form action={action} className="mt-4 flex flex-col gap-4">
            <DialogDescription className="mt-0">Tell us what is wrong with this {targetType}.</DialogDescription>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-reason">What is wrong</Label>
              <Select id="flag-reason" name="reason" defaultValue="wrong-answer">
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-details">Details (optional)</Label>
              <Textarea id="flag-details" name="details" maxLength={2000} />
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
