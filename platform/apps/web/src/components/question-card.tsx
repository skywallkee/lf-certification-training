"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { submitAnswerAction, type AnswerResult } from "@/app/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface CardOption {
  id: string;
  /** Pre-rendered option text (markdown on the server). */
  content: ReactNode;
}

const PENDING_KEY = "lfct:pending-answers";

interface Pending {
  quizId: string;
  questionId: string;
  selected: string[];
}

function readPending(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}

function writePending(items: Pending[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    /* storage blocked */
  }
}

/**
 * One question: options answered with keys 1 to 6 (toggle for multiple answer), Enter to check or move on,
 * ? for help. Answers that fail to send (network loss) are kept on this device and sent on reconnect.
 */
export function QuestionCard({
  quizId,
  questionId,
  kind,
  stem,
  options,
  isLast,
  flag,
}: {
  quizId: string;
  questionId: string;
  kind: "single" | "multiple";
  stem: ReactNode;
  options: CardOption[];
  isLast: boolean;
  flag: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [help, setHelp] = useState(false);
  const [pending, start] = useTransition();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const flush = useCallback(async () => {
    const items = readPending();
    if (items.length === 0) return;
    const left: Pending[] = [];
    for (const p of items) {
      try {
        await submitAnswerAction(p.quizId, p.questionId, p.selected);
      } catch {
        left.push(p);
      }
    }
    writePending(left);
    if (left.length === 0) {
      setOffline(false);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const toggle = useCallback(
    (id: string) => {
      if (result) return;
      setError(null);
      setSelected((cur) => (kind === "single" ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    },
    [kind, result],
  );

  // The page renders the next question (or the results) on refresh; it keys this card by question id.
  const next = useCallback(() => router.refresh(), [router]);

  const check = useCallback(() => {
    if (selected.length === 0) {
      setError("Choose an answer first.");
      return;
    }
    start(async () => {
      try {
        const res = await submitAnswerAction(quizId, questionId, selected);
        if ("error" in res) {
          setError(res.error);
          return;
        }
        if (res.feedback === "end") {
          next();
          return;
        }
        setResult(res);
      } catch {
        writePending([...readPending().filter((p) => p.questionId !== questionId || p.quizId !== quizId), { quizId, questionId, selected }]);
        setOffline(true);
      }
    });
  }, [next, questionId, quizId, selected]);

  // Move focus to "Next question" once the feedback has rendered. Focusing from the submit callback raced the
  // commit: the button did not exist yet when the frame ran, so focus stayed on the page.
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type === "text") || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog]") && e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        toggle(options[n - 1]!.id);
        return;
      }
      if (e.key === "Enter" && !(t && (t.tagName === "BUTTON" || t.tagName === "A"))) {
        e.preventDefault();
        if (result) next();
        else check();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check, next, options, result, toggle]);

  const correctSet = new Set(result?.correctIds ?? []);
  return (
    <div className="flex flex-col gap-6">
      <div className="text-[20px] font-semibold leading-relaxed" id="stem">
        {stem}
      </div>
      <fieldset className="flex flex-col gap-3" aria-describedby="stem">
        <legend className="sr-only">{kind === "single" ? "Choose one answer" : "Choose all answers that apply"}</legend>
        {kind === "multiple" ? <p className="text-sm font-medium text-muted-foreground">Choose all that apply.</p> : null}
        {options.map((o, i) => {
          const isSel = selected.includes(o.id);
          const isRight = result && correctSet.has(o.id);
          const isWrong = result && isSel && !correctSet.has(o.id);
          return (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-lg border bg-card p-4 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                isSel && !result && "border-2 border-primary bg-primary-soft",
                isRight && "border-2 border-success bg-success-soft",
                isWrong && "border-2 border-destructive bg-destructive-soft",
                result && "cursor-default",
              )}
            >
              <input
                type={kind === "single" ? "radio" : "checkbox"}
                name="answer"
                value={o.id}
                checked={isSel}
                disabled={Boolean(result)}
                onChange={() => toggle(o.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-7 flex-none items-center justify-center rounded-md border border-input text-[13px] font-semibold",
                  isSel && !result && "border-primary bg-primary text-primary-foreground",
                  isRight && "border-success bg-success text-white dark:text-background",
                  isWrong && "border-destructive bg-destructive text-white dark:text-background",
                )}
              >
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span>{o.content}</span>
                {isRight ? <span className="text-[13px] font-semibold text-success">Correct answer</span> : null}
                {isWrong ? <span className="text-[13px] font-semibold text-destructive">Your answer</span> : null}
                {result && isSel && isRight ? <span className="text-[13px] font-semibold text-success">Your answer</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {offline ? (
        <p role="status" className="rounded-md border border-warning bg-warning-soft px-4 py-2 text-sm">
          You seem to be offline. Your answer is saved on this device and is sent when you reconnect.
        </p>
      ) : null}

      <div aria-live="polite" ref={feedbackRef}>
        {result ? (
          <section aria-labelledby="why" className="flex flex-col gap-2.5 rounded-lg border bg-card p-5">
            <h2 id="why" className="text-base font-semibold">
              {result.correct ? "Correct." : "Not quite. Here is why."}
            </h2>
            <p className="text-[15px] leading-relaxed">{result.explanation}</p>
            <p className="text-sm text-muted-foreground">
              Source:{" "}
              <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                {result.sourceTitle}
              </a>
              {result.reviewDueOn ? ` · This question returns to your review queue on ${formatLong(result.reviewDueOn)}.` : ""}
            </p>
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {flag}
        {result ? (
          <Button ref={nextRef} type="button" onClick={next}>
            {isLast ? "See results" : "Next question"} <span className="font-normal opacity-85">(Enter)</span>
          </Button>
        ) : (
          <Button type="button" onClick={check} disabled={pending}>
            {pending ? "Checking…" : "Check answer"} <span className="font-normal opacity-85">(Enter)</span>
          </Button>
        )}
      </div>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Use these while answering.</DialogDescription>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="font-mono font-semibold">1 to {options.length}</dt>
            <dd>{kind === "single" ? "Choose an answer" : "Tick or untick an answer"}</dd>
            <dt className="font-mono font-semibold">Enter</dt>
            <dd>Check the answer, then go to the next question</dd>
            <dt className="font-mono font-semibold">?</dt>
            <dd>Show or hide this help</dd>
          </dl>
          <div className="mt-5 flex justify-end">
            <DialogClose asChild>
              <Button type="button">Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
