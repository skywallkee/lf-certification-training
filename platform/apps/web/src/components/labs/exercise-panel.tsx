"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Copy, Flag, Lightbulb, Loader2, XCircle } from "lucide-react";
import type { CheckResult } from "@lfct/labs/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlayerTask } from "./lab-player";

type TaskState = "passed" | "failed" | "unchecked" | "checking";

/**
 * One exercise at a time, as in the exams: a numbered navigator with each exercise's state and flag, the
 * current exercise with its cluster context, checks and hints, and Previous/Next. Flags and the current
 * exercise are remembered in this browser for the session.
 */
export function ExercisePanel(props: {
  sessionId: string;
  tasks: PlayerTask[];
  bodies: Record<string, ReactNode>;
  states: Record<string, TaskState | undefined>;
  results: CheckResult[];
  hints: Record<string, string[]>;
  multiCluster: boolean;
  canAct: boolean;
  onShowHint: (taskId: string) => void;
}) {
  const { tasks } = props;
  const storageKey = `lfct-lab:${props.sessionId}`;
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Restore after mount (localStorage is per browser and may be unavailable).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as { current?: number; flags?: string[] };
      if (typeof saved.current === "number" && saved.current >= 0 && saved.current < tasks.length) setCurrent(saved.current);
      if (Array.isArray(saved.flags)) setFlags(saved.flags.filter((f) => tasks.some((t) => t.id === f)));
    } catch {
      // Nothing saved, or storage is blocked: start at the first exercise with no flags.
    }
  }, [storageKey, tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ current, flags }));
    } catch {
      // Storage is blocked: flags last until the page is reloaded.
    }
  }, [storageKey, current, flags]);

  const task = tasks[current]!;
  const flagged = flags.includes(task.id);
  const results = props.results.filter((r) => r.taskId === task.id);
  const shown = props.hints[task.id] ?? [];
  const contextCommand = `kubectl config use-context ${task.cluster}`;
  const unsolved = tasks.filter((t) => props.states[t.id] !== "passed").length;

  const toggleFlag = () => setFlags((f) => (f.includes(task.id) ? f.filter((x) => x !== task.id) : [...f, task.id]));
  const copyContext = async () => {
    await navigator.clipboard.writeText(contextCommand).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <nav aria-label="Exercises">
        <ol className="flex flex-wrap gap-1.5">
          {tasks.map((t, i) => {
            const st = props.states[t.id] ?? "unchecked";
            const isFlagged = flags.includes(t.id);
            const label = `Exercise ${i + 1}: ${t.title}. ${stateLabel(st)}${isFlagged ? ", flagged" : ""}`;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-current={i === current ? "step" : undefined}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "relative inline-flex size-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                    i === current ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                    i !== current && st === "passed" && "border-success text-success",
                    i !== current && st === "failed" && "border-destructive/60",
                  )}
                >
                  {i + 1}
                  {isFlagged ? (
                    <Flag aria-hidden="true" className="absolute -right-1.5 -top-1.5 size-3.5 fill-warning text-warning" />
                  ) : st === "passed" ? (
                    <CheckCircle2 aria-hidden="true" className="absolute -right-1.5 -top-1.5 size-3.5 rounded-full bg-card text-success" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {unsolved === 0 ? "Every exercise passed its checks." : `${unsolved} of ${tasks.length} not passed yet`}
          {flags.length > 0 ? ` · ${flags.length} flagged` : ""}
        </p>
      </nav>

      <article aria-labelledby="exercise-title" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Exercise {current + 1} of {tasks.length} · {task.weight}%
            </p>
            <h2 id="exercise-title" className="text-lg font-semibold">
              {task.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <TaskChip state={props.states[task.id] ?? "unchecked"} />
            <Button type="button" size="sm" variant="outline" aria-pressed={flagged} onClick={toggleFlag}>
              <Flag aria-hidden="true" className={cn(flagged && "fill-warning text-warning")} />
              Flag for later
            </Button>
          </div>
        </div>

        {props.multiCluster ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
            <span>
              Cluster <strong>{task.cluster}</strong>. Switch first: <code className="font-mono text-[13px]">{contextCommand}</code>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={copyContext} aria-label={`Copy ${contextCommand}`}>
              <Copy aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}

        <div className="text-[15px]">{props.bodies[task.id]}</div>

        {results.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label={`Checks for exercise ${current + 1}`}>
            {results.map((r) => (
              <li key={r.checkId} className="flex items-start gap-2 text-sm">
                {r.passed ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span>
                  <span className="sr-only">{r.passed ? "Passed: " : "Failed: "}</span>
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {task.hintsTotal > 0 ? (
          <div>
            {shown.length > 0 ? (
              <ol className="mb-2 flex flex-col gap-1.5">
                {shown.map((h, j) => (
                  <li key={j} className="flex items-start gap-2 rounded-md bg-primary-soft px-3 py-2 text-sm">
                    <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-semibold">Hint {j + 1}: </span>
                      {h}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {shown.length < task.hintsTotal ? (
              <Button type="button" size="sm" variant="ghost" disabled={!props.canAct} onClick={() => props.onShowHint(task.id)}>
                <Lightbulb aria-hidden="true" />
                Show hint {shown.length + 1} of {task.hintsTotal}
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button type="button" size="sm" variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={current === tasks.length - 1}
          onClick={() => setCurrent((c) => Math.min(tasks.length - 1, c + 1))}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function stateLabel(state: TaskState): string {
  return { passed: "Passed", failed: "Not yet", unchecked: "Not checked", checking: "Checking" }[state];
}

function TaskChip({ state }: { state: TaskState }) {
  const map = {
    passed: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
    failed: { cls: "bg-destructive-soft text-destructive", Icon: XCircle },
    unchecked: { cls: "bg-muted text-muted-foreground", Icon: CircleDashed },
    checking: { cls: "bg-primary-soft text-primary", Icon: Loader2 },
  }[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", map.cls)}>
      <map.Icon aria-hidden="true" className={cn("size-3.5", state === "checking" && "animate-spin motion-reduce:animate-none")} />
      {stateLabel(state)}
    </span>
  );
}
