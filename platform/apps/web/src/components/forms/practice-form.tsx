"use client";

import { useState } from "react";
import { startQuizAction } from "@/app/actions/study";
import { Button } from "@/components/ui/button";
import { FieldHint, Label, Select } from "@/components/ui/field";

export interface PracticeCert {
  code: string;
  name: string;
  questions: number;
  domains: { key: string; name: string; weight: number; questions: number }[];
}

export function PracticeForm({ certs, initialCert, initialDomains }: { certs: PracticeCert[]; initialCert: string; initialDomains: string[] }) {
  const [code, setCode] = useState(initialCert);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const cert = certs.find((c) => c.code === code) ?? certs[0]!;
  const available = domains.length === 0 ? cert.questions : cert.domains.filter((d) => domains.includes(d.key)).reduce((n, d) => n + d.questions, 0);
  return (
    <form action={startQuizAction} className="flex flex-col gap-6">
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="cert">Cert</Label>
        <Select
          id="cert"
          name="cert"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setDomains([]);
          }}
        >
          {certs.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}: {c.name} ({c.questions} questions)
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Domains</legend>
        <FieldHint className="mb-1">Leave all unticked to practise the whole cert.</FieldHint>
        {cert.domains.map((d) => (
          <label key={d.key} className="flex min-h-6 items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              name="domains"
              value={d.key}
              checked={domains.includes(d.key)}
              onChange={(e) => setDomains((cur) => (e.target.checked ? [...cur, d.key] : cur.filter((x) => x !== d.key)))}
              className="size-4 accent-[var(--color-primary)]"
            />
            <span>
              {d.name} · {d.weight}%
              <span className="text-muted-foreground">
                {" "}
                ({d.questions} question{d.questions === 1 ? "" : "s"})
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="count">Questions</Label>
          <Select id="count" name="count" defaultValue="5" className="w-28">
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Feedback</legend>
          <label className="flex min-h-6 items-center gap-2 text-[15px]">
            <input type="radio" name="feedback" value="instant" defaultChecked className="size-4 accent-[var(--color-primary)]" />
            After each question
          </label>
          <label className="flex min-h-6 items-center gap-2 text-[15px]">
            <input type="radio" name="feedback" value="end" className="size-4 accent-[var(--color-primary)]" />
            At the end, like an exam
          </label>
        </fieldset>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {available === 0
          ? "No questions match this selection yet. Choose more domains, or another cert."
          : `${available} question${available === 1 ? "" : "s"} available. Practice quizzes have no timer.`}
      </p>
      <div>
        <Button type="submit" disabled={available === 0}>
          Start quiz
        </Button>
      </div>
    </form>
  );
}
