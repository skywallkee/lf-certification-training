"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, updateProfileAction, type ProfileState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/field";

export function ProfileForm({ name, timeZone, hours, zones }: { name: string; timeZone: string; hours: number | null; zones: string[] }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={80} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeZone">Time zone</Label>
        <Select id="timeZone" name="timeZone" defaultValue={timeZone}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hours">Study hours a week</Label>
        <Select id="hours" name="hours" defaultValue={String(hours ?? 4)} className="max-w-40">
          {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </Select>
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          Profile saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

/** Irreversible, so it asks in a dialog and needs the word DELETE typed. */
export function DeleteAccount() {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(deleteAccountAction, {});
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          Delete my account and data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogDescription>
          This deletes your profile, exam dates, answers, review queue, notes and saved items. It cannot be undone.
        </DialogDescription>
        <form action={action} className="mt-4 flex flex-col gap-3">
          <Label htmlFor="confirm">Type DELETE to confirm</Label>
          <Input id="confirm" name="confirm" autoComplete="off" required />
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Keep my account
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              Delete everything
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
