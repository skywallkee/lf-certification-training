"use client";

import { useActionState, useState } from "react";
import { setExamStatusAction, type StatusFormState } from "@/app/actions/study";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

/** Mark a cert booked (with the exam date) or passed (with the pass date), or clear it. */
export function ExamStatusForm({
  cert,
  state,
  date,
  today,
}: {
  cert: string;
  state: "booked" | "passed" | null;
  date: string | null;
  today: string;
}) {
  const [result, action, pending] = useActionState<StatusFormState, FormData>(setExamStatusAction, {});
  const [choice, setChoice] = useState<"booked" | "passed">(state ?? "booked");
  return (
    <div className="flex flex-col gap-3">
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="cert" value={cert} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-medium">Status</legend>
        {(["booked", "passed"] as const).map((s) => (
          <label key={s} className="flex min-h-6 items-center gap-2 text-[15px]">
            <input type="radio" name="state" value={s} checked={choice === s} onChange={() => setChoice(s)} className="size-4 accent-[var(--color-primary)]" />
            {s === "booked" ? "Exam booked" : "Passed"}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`date-${cert}`}>{choice === "booked" ? "Exam date" : "Date passed"}</Label>
        <Input
          id={`date-${cert}`}
          name="date"
          type="date"
          required
          defaultValue={date ?? ""}
          {...(choice === "booked" ? { min: today } : { max: today })}
          className="max-w-56"
        />
      </div>
      {result.error ? <FieldError>{result.error}</FieldError> : null}
      {result.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          {result.ok}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          Save status
        </Button>
      </div>
    </form>
    {state ? (
      <form action={action}>
        <input type="hidden" name="cert" value={cert} />
        <input type="hidden" name="state" value="clear" />
        <Button type="submit" variant="link" size="sm" className="px-0" disabled={pending}>
          Clear {cert} status
        </Button>
      </form>
    ) : null}
    </div>
  );
}
