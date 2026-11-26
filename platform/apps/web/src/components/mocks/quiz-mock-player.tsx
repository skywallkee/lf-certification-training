"use client";

import { Flag, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { saveQuizDraftAction, submitQuizMockAction } from "@/app/actions/quiz-mocks";
import { SessionTimer } from "@/components/labs/session-timer";
import { TabTitle } from "@/components/labs/tab-title";
import { SampleBadge } from "@/components/status-chip";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { en } from "@/messages/en";
import { cn } from "@/lib/utils";

export interface PlayerQuestion {
  id: string;
  kind: "single" | "multiple";
  stem: ReactNode;
  options: { id: string; content: ReactNode }[];
}

interface Draft {
  answers: Record<string, string[]>;
  flags: string[];
  current: number;
}

/**
 * The multiple-choice mock exam player: one question at a time with a navigator, flags, and a timer. Answers save
 * on their own (a moment after each change) and the attempt is graded when the learner submits or time runs out.
 * No feedback until then, as in the real exam.
 */
export function QuizMockPlayer(props: {
  attemptId: string;
  title: string;
  mock: boolean;
  passPercent: number;
  questions: PlayerQuestion[];
  initial: Draft;
  expiresAt: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [skewMs] = useState(() => new Date(props.serverNow).getTime() - Date.now());
  const [draft, setDraft] = useState<Draft>(props.initial);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [submitting, setSubmitting] = useState<null | "submit" | "time">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const latest = useRef(draft);
  const dirty = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const total = props.questions.length;
  const index = Math.min(draft.current, total - 1);
  const q = props.questions[index]!;
  const answered = props.questions.filter((x) => (draft.answers[x.id]?.length ?? 0) > 0).length;
  const unanswered = total - answered;
  const flagged = props.questions.map((x, i) => ({ ...x, n: i + 1 })).filter((x) => draft.flags.includes(x.id));

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const out = await saveQuizDraftAction(props.attemptId, latest.current);
    if (out.ok) setSaveState(dirty.current ? "saving" : "saved");
    else if (out.ended) router.refresh();
    else setSaveState("error");
  }, [props.attemptId, router]);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [draft, save]);

  const submit = useCallback(
    (why: "submit" | "time") => {
      setSubmitting((s) => s ?? why);
      startTransition(async () => {
        const out = await submitQuizMockAction(props.attemptId, latest.current);
        if (!out.ok) setNotice(out.error);
        router.refresh();
      });
    },
    [props.attemptId, router],
  );

  // Time up: submit what is answered.
  useEffect(() => {
    const left = new Date(props.expiresAt).getTime() - (Date.now() + skewMs);
    const t = setTimeout(() => submit("time"), Math.max(0, left));
    return () => clearTimeout(t);
  }, [props.expiresAt, skewMs, submit]);

  const update = (patch: Partial<Draft>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const go = (i: number) => {
    update({ current: Math.max(0, Math.min(total - 1, i)) });
    requestAnimationFrame(() => heading.current?.focus());
  };
  const choose = (optionId: string) => {
    const cur = draft.answers[q.id] ?? [];
    const next = q.kind === "single" ? [optionId] : cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
    update({ answers: { ...draft.answers, [q.id]: next } });
  };
  const toggleFlag = () => update({ flags: draft.flags.includes(q.id) ? draft.flags.filter((f) => f !== q.id) : [...draft.flags, q.id] });

  if (submitting) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <section aria-live="polite" className="flex max-w-md flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
          <p className="text-lg font-semibold">{submitting === "time" ? en.quizMocks.timeUp : en.quizMocks.grading}</p>
          {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
        </section>
      </div>
    );
  }

  const selected = draft.answers[q.id] ?? [];
  return (
    <div className="flex min-h-dvh flex-col">
      <TabTitle label={null} expiresAt={props.expiresAt} skewMs={skewMs} />
      <div role="toolbar" aria-label="Exam controls" className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/mocks" className="font-bold text-foreground no-underline hover:text-foreground">
            {en.appName}
          </Link>
          <span className="truncate text-sm font-semibold">{props.title}</span>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">Multiple choice</span>
          {props.mock ? <SampleBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, retrying on the next change" : "All answers saved"}
          </span>
          <ThemeToggle showLabel={false} />
          <SessionTimer expiresAt={props.expiresAt} skewMs={skewMs} what="exam" />
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                {en.mocks.submit}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{en.mocks.submitTitle}</DialogTitle>
              <DialogDescription>{en.quizMocks.submitBody(answered, total)}</DialogDescription>
              {unanswered > 0 ? <p className="mt-3 text-sm font-semibold text-warning">{en.quizMocks.unanswered(unanswered)}</p> : null}
              {flagged.length > 0 ? (
                <div className="mt-3 text-sm">
                  <p className="font-semibold">{en.quizMocks.flagged(flagged.length)}</p>
                  <p className="mt-1 text-muted-foreground">Questions {flagged.map((f) => f.n).join(", ")}</p>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {en.mocks.keepWorking}
                  </Button>
                </DialogClose>
                <Button type="button" variant="destructive" onClick={() => submit("submit")}>
                  {en.mocks.submitConfirm}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1100px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_260px]">
        <main id="main" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
              Question {index + 1} of {total}
            </h1>
            <Button type="button" variant={draft.flags.includes(q.id) ? "default" : "outline"} size="sm" aria-pressed={draft.flags.includes(q.id)} onClick={toggleFlag}>
              <Flag aria-hidden="true" /> {draft.flags.includes(q.id) ? "Flagged" : "Flag for later"}
            </Button>
          </div>
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 sm:p-6">
            <div className="text-[17px] font-medium">{q.stem}</div>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{q.kind === "single" ? "Choose one answer" : "Choose all answers that apply"}</legend>
              {q.kind === "multiple" ? <p className="text-sm font-medium text-muted-foreground">Choose all that apply.</p> : null}
              {q.options.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-[15px]",
                      on ? "border-primary bg-primary-soft" : "hover:bg-muted",
                    )}
                  >
                    <input
                      type={q.kind === "single" ? "radio" : "checkbox"}
                      name={`q-${q.id}`}
                      className="mt-1 size-4 shrink-0"
                      checked={on}
                      onChange={() => choose(o.id)}
                    />
                    <span className="min-w-0 flex-1">{o.content}</span>
                  </label>
                );
              })}
            </fieldset>
          </section>
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden="true" /> Previous
            </Button>
            {index < total - 1 ? (
              <Button type="button" onClick={() => go(index + 1)}>
                Next <ChevronRight aria-hidden="true" />
              </Button>
            ) : (
              <span className="self-center text-sm text-muted-foreground">Last question. Submit when you are done.</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{en.quizMocks.noFeedback(props.passPercent)}</p>
        </main>

        <nav aria-label="Questions" className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-semibold">
            {answered} of {total} answered
          </p>
          <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
            {props.questions.map((x, i) => {
              const isAnswered = (draft.answers[x.id]?.length ?? 0) > 0;
              const isFlagged = draft.flags.includes(x.id);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", not answered"}${isFlagged ? ", flagged" : ""}`}
                    className={cn(
                      "relative flex size-10 items-center justify-center rounded-md border text-sm font-medium tabular-nums",
                      isAnswered ? "border-primary bg-primary-soft text-primary" : "bg-card",
                      i === index && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                  >
                    {i + 1}
                    {isFlagged ? <Flag aria-hidden="true" className="absolute -right-1 -top-1 size-3.5 fill-warning text-warning" /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">Filled: answered. Flag: marked for later.</p>
        </nav>
      </div>
    </div>
  );
}
