"use client";

import { useActionState } from "react";
import { sendPlanNowAction, setExamDateAction, updateRemindersAction, type PlanFormState, type RemindersState } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Status({ state }: { state: PlanFormState }) {
  if (state.error) return <FieldError>{state.error}</FieldError>;
  if (state.ok)
    return (
      <p role="status" className="text-sm font-medium text-success">
        {state.ok}
      </p>
    );
  return null;
}

/** Exam date for one cert: a target date, or the booked date when "I have booked it" is ticked. */
export function ExamDateForm({
  cert,
  date,
  booked,
  today,
  max,
  choices,
}: {
  cert: string;
  date: string | null;
  booked: boolean;
  today: string;
  max: string;
  /** When set, the learner picks the cert from these instead. */
  choices?: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<PlanFormState, FormData>(setExamDateAction, {});
  const id = `exam-date-${cert}`;
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap items-end gap-3">
        {choices ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-cert`}>Cert</Label>
            <Select id={`${id}-cert`} name="cert" defaultValue={cert} className="w-56">
              {choices.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <input type="hidden" name="cert" value={cert} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{choices ? "Exam date" : `${cert} exam date`}</Label>
          <Input id={id} name="date" type="date" required min={today} max={max} defaultValue={date ?? ""} className="w-48" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" name="booked" defaultChecked={booked} className="size-4 accent-[var(--color-primary)]" />
          I have booked it
        </label>
        <Button type="submit" variant={date ? "outline" : "default"} disabled={pending}>
          {date ? "Update date" : "Build my plan"}
        </Button>
      </form>
      {date ? (
        <form action={action}>
          <input type="hidden" name="cert" value={cert} />
          <input type="hidden" name="intent" value="clear" />
          <Button type="submit" variant="link" size="sm" disabled={pending}>
            Remove the {cert} exam date
          </Button>
        </form>
      ) : null}
      <Status state={state} />
    </div>
  );
}

export function SendPlanNow() {
  const [state, action, pending] = useActionState<PlanFormState, FormData>(sendPlanNowAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Email me this week's plan"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function RemindersForm({
  weekly,
  nudge,
  exam,
  day,
  hour,
  timeZone,
  verified,
}: {
  weekly: boolean;
  nudge: boolean;
  exam: boolean;
  day: number;
  hour: number;
  timeZone: string;
  verified: boolean;
}) {
  const [state, action, pending] = useActionState<RemindersState, FormData>(updateRemindersAction, {});
  const box = "mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]";
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Email me</legend>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="weekly" defaultChecked={weekly} className={box} />
          <span>
            This week&apos;s study plan
            <span className="block text-sm text-muted-foreground">Once a week, for each cert with an exam date.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="nudge" defaultChecked={nudge} className={box} />
          <span>
            A nudge when I have not studied for 3 days
            <span className="block text-sm text-muted-foreground">One email per quiet spell, with a short first step.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="exam" defaultChecked={exam} className={box} />
          <span>
            Exam countdown
            <span className="block text-sm text-muted-foreground">A week before the exam and the day before.</span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remind-day">Weekly plan on</Label>
          <Select id="remind-day" name="day" defaultValue={String(day)} className="w-44">
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remind-hour">From</Label>
          <Select id="remind-hour" name="hour" defaultValue={String(hour)} className="w-32" aria-describedby="remind-hour-hint">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <FieldHint id="remind-hour-hint">
        Times are in your time zone, {timeZone}. Every email has a link to stop them.
        {verified ? "" : " Reminders go out once your email address is verified."}
      </FieldHint>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          Reminder settings saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          Save reminders
        </Button>
      </div>
    </form>
  );
}
