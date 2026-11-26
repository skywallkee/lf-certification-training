"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { onboardingAction, type OnboardingState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";
import { chooseFocus, type Goal } from "@/lib/path";
import { cn } from "@/lib/utils";

export interface OnboardingGroup {
  name: string;
  certs: { code: string; name: string }[];
}

export interface OnboardingInitial {
  goal: Goal;
  goalCert: string;
  hours: number;
  /** Certs already marked passed, with the pass date. */
  passed: Record<string, string>;
}

const STEPS = ["Goal", "Certs you hold", "Study time", "Your plan"] as const;
const HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
const GOALS = [
  ["golden", "All 17: Golden Kubestronaut", "Every CNCF and Linux Foundation cert on the path, in a suggested order."],
  ["kubestronaut", "The Kubestronaut 5", "KCNA, KCSA, CKA, CKAD and CKS."],
  ["one", "One cert", "Focus on a single exam."],
] as const;

/**
 * Guided first-run setup, one question per step. Every field stays in the form while hidden, so the last step
 * submits all of them at once and the server checks them again.
 */
export function OnboardingForm({ groups, today, initial }: { groups: OnboardingGroup[]; today: string; initial: OnboardingInitial }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(onboardingAction, {});
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>(initial.goal);
  const [goalCert, setGoalCert] = useState(initial.goalCert);
  const [passed, setPassed] = useState<Record<string, string>>(initial.passed);
  const [hours, setHours] = useState(initial.hours);
  const [stepError, setStepError] = useState<string>();
  const [tz, setTz] = useState("UTC");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  // Move focus to the new step's heading so keyboard and screen reader users land on the question.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const all = groups.flatMap((g) => g.certs);
  const held = Object.keys(passed);
  const focus = chooseFocus(goal, goal === "one" ? goalCert : null, new Set(held));
  const focusName = all.find((c) => c.code === focus)?.name;

  function next() {
    if (step === 1) {
      const missing = held.find((c) => !passed[c]);
      if (missing) return setStepError(`Enter the date you passed ${missing}, roughly is fine.`);
      const future = held.find((c) => passed[c]! > today);
      if (future) return setStepError(`The pass date for ${future} cannot be in the future.`);
    }
    setStepError(undefined);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStepError(undefined);
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-8"
      noValidate
      onKeyDown={(e) => {
        // Enter in a field moves to the next step instead of submitting early.
        if (e.key === "Enter" && step < STEPS.length - 1 && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          next();
        }
      }}
    >
      <input type="hidden" name="timeZone" value={tz} />

      <ol aria-label="Setup steps" className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-border")} aria-hidden="true" />
            <span className={cn("text-xs sm:text-sm", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span className="sr-only">{i < step ? "Done: " : i === step ? "Current: " : ""}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <section hidden={step !== 0} aria-labelledby="step-goal" className="flex flex-col gap-4">
        <h2 id="step-goal" ref={step === 0 ? heading : undefined} tabIndex={-1} className="text-xl font-semibold outline-none">
          What are you aiming for?
        </h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Goal</legend>
          {GOALS.map(([value, label, hint]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border bg-card p-4 text-[15px]",
                goal === value && "border-primary ring-1 ring-primary",
              )}
            >
              <input
                type="radio"
                name="goal"
                value={value}
                checked={goal === value}
                onChange={() => setGoal(value)}
                className="mt-1 size-4 accent-[var(--color-primary)]"
              />
              <span>
                <span className="font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {goal === "one" ? (
          <div className="flex max-w-md flex-col gap-1.5">
            <Label htmlFor="goalCert">Which cert?</Label>
            <Select id="goalCert" name="goalCert" value={goalCert} onChange={(e) => setGoalCert(e.target.value)}>
              {all.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </section>

      <section hidden={step !== 1} aria-labelledby="step-held" className="flex flex-col gap-4">
        <h2 id="step-held" ref={step === 1 ? heading : undefined} tabIndex={-1} className="text-xl font-semibold outline-none">
          Which certs do you already hold?
        </h2>
        <FieldHint>Tick the ones you have passed and add the date, so we skip them and show when each expires. None yet? Just continue.</FieldHint>
        {groups.map((g) => (
          <fieldset key={g.name} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-muted-foreground">{g.name}</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.certs.map((c) => {
                const on = c.code in passed;
                return (
                  <li key={c.code} className="flex flex-col gap-2 rounded-md border bg-card p-3">
                    <label className="flex min-h-6 items-center gap-3 text-[15px]">
                      <input
                        type="checkbox"
                        name="held"
                        value={c.code}
                        checked={on}
                        onChange={(e) =>
                          setPassed((cur) => {
                            const copy = { ...cur };
                            if (e.target.checked) copy[c.code] = "";
                            else delete copy[c.code];
                            return copy;
                          })
                        }
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      <span>
                        <span className="font-semibold">{c.code}</span> <span className="text-muted-foreground">{c.name}</span>
                      </span>
                    </label>
                    {on ? (
                      <div className="flex flex-col gap-1 pl-7">
                        <Label htmlFor={`passed-${c.code}`}>Date passed</Label>
                        <Input
                          id={`passed-${c.code}`}
                          name={`passed-${c.code}`}
                          type="date"
                          max={today}
                          required
                          value={passed[c.code]}
                          onChange={(e) => setPassed((cur) => ({ ...cur, [c.code]: e.target.value }))}
                          className="max-w-48"
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </section>

      <section hidden={step !== 2} aria-labelledby="step-hours" className="flex flex-col gap-4">
        <h2 id="step-hours" ref={step === 2 ? heading : undefined} tabIndex={-1} className="text-xl font-semibold outline-none">
          How much time can you study?
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hours">Hours a week</Label>
          <Select id="hours" name="hours" value={String(hours)} onChange={(e) => setHours(Number(e.target.value))} className="max-w-40">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
          <FieldHint>A rough number is fine. You can change it on your account page.</FieldHint>
        </div>
      </section>

      <section hidden={step !== 3} aria-labelledby="step-plan" className="flex flex-col gap-4">
        <h2 id="step-plan" ref={step === 3 ? heading : undefined} tabIndex={-1} className="text-xl font-semibold outline-none">
          Your plan
        </h2>
        <dl className="grid gap-3 rounded-md border bg-card p-4 text-[15px] sm:grid-cols-[max-content_1fr] sm:gap-x-6">
          <dt className="text-muted-foreground">Goal</dt>
          <dd>{goal === "one" ? `One cert: ${goalCert}` : GOALS.find(([v]) => v === goal)?.[1]}</dd>
          <dt className="text-muted-foreground">Already passed</dt>
          <dd>{held.length > 0 ? held.join(", ") : "None yet"}</dd>
          <dt className="text-muted-foreground">Study time</dt>
          <dd>
            {hours} hour{hours === 1 ? "" : "s"} a week
          </dd>
          <dt className="text-muted-foreground">First focus</dt>
          <dd className="font-semibold">
            {focus ? `${focus}${focusName ? `: ${focusName}` : ""}` : "You already hold every cert in this goal. Today will help you keep them current."}
          </dd>
        </dl>
        <FieldHint>Today will show your next step for {focus ?? "your certs"}. You can change your goal later from your account page.</FieldHint>
      </section>

      {stepError ? <FieldError>{stepError}</FieldError> : null}
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <div className="flex flex-wrap gap-3">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={back}>
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          // Distinct keys: reusing one element would turn it into the submit button mid-click and submit early.
          <Button key="continue" type="button" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button key="submit" type="submit" disabled={pending}>
            {pending ? "Setting up…" : "Start studying"}
          </Button>
        )}
      </div>
    </form>
  );
}
