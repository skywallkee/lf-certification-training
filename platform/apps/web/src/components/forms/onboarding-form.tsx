"use client";

import { useActionState, useEffect, useState } from "react";
import { onboardingAction, type OnboardingState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";

export interface OnboardingGroup {
  name: string;
  certs: { code: string; name: string }[];
}

export function OnboardingForm({ groups, today }: { groups: OnboardingGroup[]; today: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(onboardingAction, {});
  const [held, setHeld] = useState<string[]>([]);
  const [goal, setGoal] = useState<"golden" | "kubestronaut" | "one">("golden");
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  const all = groups.flatMap((g) => g.certs);
  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="timeZone" value={tz} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">1. Which certs do you already hold?</legend>
        <FieldHint>Tick the ones you have passed and add the date, so we can show when each expires. Skip if none.</FieldHint>
        {groups.map((g) => (
          <div key={g.name} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted-foreground">{g.name}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.certs.map((c) => {
                const on = held.includes(c.code);
                return (
                  <li key={c.code} className="flex flex-col gap-2 rounded-md border bg-card p-3">
                    <label className="flex min-h-6 items-center gap-3 text-[15px]">
                      <input
                        type="checkbox"
                        name="held"
                        value={c.code}
                        checked={on}
                        onChange={(e) => setHeld((cur) => (e.target.checked ? [...cur, c.code] : cur.filter((x) => x !== c.code)))}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      <span>
                        <span className="font-semibold">{c.code}</span> <span className="text-muted-foreground">{c.name}</span>
                      </span>
                    </label>
                    {on ? (
                      <div className="flex flex-col gap-1 pl-7">
                        <Label htmlFor={`passed-${c.code}`}>Date passed</Label>
                        <Input id={`passed-${c.code}`} name={`passed-${c.code}`} type="date" max={today} required className="max-w-48" />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">2. What is your goal?</legend>
        {(
          [
            ["golden", "All 17: Golden Kubestronaut"],
            ["kubestronaut", "The Kubestronaut 5: KCNA, KCSA, CKA, CKAD and CKS"],
            ["one", "One cert"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-6 items-center gap-3 text-[15px]">
            <input type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)} className="size-4 accent-[var(--color-primary)]" />
            {label}
          </label>
        ))}
        {goal === "one" ? (
          <div className="flex max-w-md flex-col gap-1.5 pl-7">
            <Label htmlFor="goalCert">Which cert?</Label>
            <Select id="goalCert" name="goalCert" defaultValue="CKA">
              {all.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hours" className="text-lg font-semibold">
          3. How many hours a week can you study?
        </Label>
        <Select id="hours" name="hours" defaultValue="4" className="max-w-40">
          {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((h) => (
            <option key={h} value={h}>
              {h} hour{h === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Setting up…" : "Show my first step"}
        </Button>
      </div>
    </form>
  );
}
