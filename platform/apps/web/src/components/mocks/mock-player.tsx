"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ListChecks, Loader2, Play } from "lucide-react";
import { taskStates, type CheckResult } from "@lfct/labs/status";
import { beginMockAction, checkMockTaskAction, submitMockAction } from "@/app/actions/mocks";
import { BootProgress } from "@/components/labs/boot-progress";
import { DocsPanel, type DocsLink } from "@/components/labs/docs-panel";
import { ExercisePanel } from "@/components/labs/exercise-panel";
import type { PlayerTask } from "@/components/labs/lab-player";
import { SessionTimer } from "@/components/labs/session-timer";
import { TerminalPane } from "@/components/labs/terminal-pane";
import { SampleBadge } from "@/components/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

interface Poll {
  status: string;
  bootStep: number;
  statusMessage: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  now: string;
  createdAt: string;
}

export interface MockPlayerProps {
  sessionId: string;
  title: string;
  certCode: string;
  mock: boolean;
  mode: "exam" | "practice";
  minutes: number;
  clusters: string[];
  /** Titles are empty until Start. */
  tasks: PlayerTask[];
  /** Task statements rendered on the server, present only after Start. */
  bodies: Record<string, ReactNode>;
  docs: DocsLink[];
  startWindowMinutes: number;
  initial: Poll;
  /** Practice mode: the newest result of each task's own Check. */
  lastResults: CheckResult[];
}

/**
 * The practical mock exam. Three phases on one page: prepare (clusters boot while the rules show; Start
 * lights up when everything is healthy), the exam (tasks and docs on the left, terminal on the right,
 * countdown and Submit on top), and grading (terminal frozen, then on to the results). The deadline lives on
 * the server; at zero the player submits on its own, and the sweeper does the same if the tab is closed.
 */
export function MockPlayer(props: MockPlayerProps) {
  const router = useRouter();
  const [poll, setPoll] = useState<Poll>(props.initial);
  const [skewMs, setSkewMs] = useState(() => new Date(props.initial.now).getTime() - Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<"tasks" | "docs">("tasks");
  const [flags, setFlags] = useState<string[]>([]);
  const [results, setResults] = useState<CheckResult[]>(props.lastResults);
  const [checkingTask, setCheckingTask] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, startStarting] = useTransition();
  const [grading, setGrading] = useState<null | "submit" | "time">(null);
  const [warning, setWarning] = useState<number | null>(null);
  const submitForm = useRef<HTMLFormElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const ended = !["requested", "booting", "ready"].includes(poll.status);
  const ready = poll.status === "ready";
  const started = ready && poll.startedAt !== null;
  const examName = props.mode === "exam" ? en.mocks.examMode : en.mocks.practiceMode;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/labs/sessions/${props.sessionId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as Omit<Poll, "createdAt">;
    setSkewMs(new Date(next.now).getTime() - Date.now());
    setPoll((p) => ({ ...p, ...next }));
  }, [props.sessionId]);

  useEffect(() => {
    if (ended || grading) return;
    const t = setInterval(refresh, ready ? 10_000 : 1500);
    return () => clearInterval(t);
  }, [ended, ready, grading, refresh]);

  useEffect(() => {
    if (ended && poll.status !== "failed") router.replace(`/mocks/results/${props.sessionId}`);
  }, [ended, poll.status, props.sessionId, router]);

  // Boot timer on the prepare screen.
  useEffect(() => {
    if (ready || ended) return;
    const start = new Date(props.initial.createdAt).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() + skewMs - start) / 1000))), 1000);
    return () => clearInterval(t);
  }, [ready, ended, props.initial.createdAt, skewMs]);

  // Countdown side effects: visible warnings at 10 and 2 minutes, and submit at zero.
  useEffect(() => {
    if (!started || !poll.expiresAt || grading) return;
    const deadline = new Date(poll.expiresAt).getTime();
    const tick = () => {
      const left = deadline - (Date.now() + skewMs);
      if (left <= 0) {
        setGrading("time");
        submitForm.current?.requestSubmit();
        return;
      }
      const mins = left / 60_000;
      setWarning(mins <= 2 ? 2 : mins <= 10 ? 10 : null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [started, poll.expiresAt, skewMs, grading]);

  // Leaving the exam window (the page becomes hidden) is counted and shown in the results only.
  useEffect(() => {
    if (!started) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const url = `/api/labs/sessions/${props.sessionId}/window-leave`;
      if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [started, props.sessionId]);

  // F6 / Shift+F6: toolbar -> task panel -> terminal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F6") return;
      e.preventDefault();
      const terminal = mainRef.current?.querySelector<HTMLElement>(".xterm-helper-textarea") ?? mainRef.current?.querySelector<HTMLElement>("[data-region=terminal]");
      const regions = [toolbar.current, panel.current, terminal].filter((r): r is HTMLElement => Boolean(r));
      const current = regions.findIndex((r) => r.contains(document.activeElement));
      const next = regions[(current + (e.shiftKey ? regions.length - 1 : 1) + regions.length) % regions.length];
      next?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const begin = () => {
    setNotice(null);
    startStarting(async () => {
      const out = await beginMockAction(props.sessionId);
      if (!out.ok) {
        setNotice(out.error);
        return;
      }
      setPoll((p) => ({ ...p, startedAt: out.startedAt, expiresAt: out.expiresAt }));
      // The task statements are rendered on the server and sent only now.
      router.refresh();
    });
  };

  const checkTask = async (taskId: string) => {
    setCheckingTask(taskId);
    setNotice(null);
    const out = await checkMockTaskAction(props.sessionId, taskId);
    setCheckingTask(null);
    if (out.ok) setResults((r) => [...r.filter((x) => x.taskId !== taskId), ...out.results]);
    else setNotice(out.error);
  };

  const states: Record<string, "passed" | "failed" | "unchecked" | "checking"> = { ...taskStates(props.tasks, results) };
  if (checkingTask) states[checkingTask] = "checking";
  const flaggedTasks = props.tasks.map((t, i) => ({ ...t, n: i + 1 })).filter((t) => flags.includes(t.id));

  return (
    <div className="flex h-dvh min-h-[600px] flex-col">
      <div
        ref={toolbar}
        tabIndex={-1}
        role="toolbar"
        aria-label="Exam controls"
        className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5 sm:px-6"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/mocks" className="font-bold text-foreground no-underline hover:text-foreground">
            {en.appName}
          </Link>
          <span className="truncate text-sm font-semibold">{props.title}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              props.mode === "exam" ? "bg-primary-soft text-primary" : "bg-success-soft text-success",
            )}
          >
            {examName}
          </span>
          {props.mock ? <SampleBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SessionTimer
            expiresAt={started ? poll.expiresAt : null}
            skewMs={skewMs}
            what="exam"
            waitingLabel={`${props.minutes} min · the clock starts when you press Start`}
          />
          {started ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" size="sm" disabled={grading !== null}>
                  {en.mocks.submit}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>{en.mocks.submitTitle}</DialogTitle>
                <DialogDescription>{en.mocks.submitBody}</DialogDescription>
                {flaggedTasks.length > 0 ? (
                  <div className="mt-3 text-sm">
                    <p className="font-semibold">{en.mocks.submitFlagged(flaggedTasks.length)}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {flaggedTasks.map((t) => (
                        <li key={t.id}>
                          Task {t.n}: {t.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      {en.mocks.keepWorking}
                    </Button>
                  </DialogClose>
                  <Button type="button" variant="destructive" onClick={() => submitForm.current?.requestSubmit()}>
                    {en.mocks.submitConfirm}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={ended || grading !== null} onClick={() => submitForm.current?.requestSubmit()}>
              {en.mocks.leave}
            </Button>
          )}
          {/* One form for Submit, time up and leaving: the action grades (if started) and deletes the clusters. */}
          <form ref={submitForm} action={submitMockAction} onSubmit={() => setGrading((g) => g ?? "submit")} className="hidden">
            <input type="hidden" name="session" value={props.sessionId} />
          </form>
        </div>
      </div>
      <p className="border-b bg-warning-soft px-4 py-2 text-sm md:hidden">Mock exams need a larger screen with a keyboard.</p>
      {warning && started && !grading ? (
        <p role="alert" className={cn("flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold", warning === 2 ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning")}>
          <AlertTriangle aria-hidden="true" className="size-4" />
          {en.mocks.warn(warning)}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="border-b bg-primary-soft px-4 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {grading ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <section aria-live="polite" className="flex max-w-md flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
            <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary motion-reduce:animate-none" />
            <h2 className="text-lg font-semibold">{started ? (grading === "time" ? en.mocks.timeUp : en.mocks.grading) : "Removing your clusters…"}</h2>
            <p className="text-sm text-muted-foreground">You will see your results here when it is done.</p>
          </section>
        </div>
      ) : !started ? (
        <PrepareScreen
          poll={poll}
          elapsed={elapsed}
          clusters={props.clusters}
          taskCount={props.tasks.length}
          minutes={props.minutes}
          docs={props.docs}
          startWindowMinutes={props.startWindowMinutes}
          skewMs={skewMs}
          starting={starting}
          onStart={begin}
        />
      ) : (
        <div ref={mainRef} className={cn("grid min-h-0 flex-1 gap-4 overflow-auto p-4 xl:overflow-hidden", tab === "docs" ? "xl:grid-cols-[minmax(420px,1fr)_minmax(0,1fr)]" : "xl:grid-cols-[minmax(340px,460px)_1fr]")}>
          <div ref={panel} tabIndex={-1} role="region" aria-label="Tasks and documentation" className="flex min-h-0 flex-col gap-4 rounded-lg border bg-card p-5">
            <div role="tablist" aria-label="Left panel" className="flex gap-1 rounded-md bg-muted p-1">
              {(
                [
                  ["tasks", "Tasks", ListChecks],
                  ["docs", "Documentation", BookOpen],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls={`panel-${key}`}
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold",
                    tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" hidden={tab !== "tasks"} className="flex min-h-0 flex-1 flex-col gap-4">
              {props.mode === "exam" ? <p className="text-sm text-muted-foreground">{en.mocks.noFeedback}</p> : null}
              {props.tasks.every((t) => t.title) ? (
                <ExercisePanel
                  sessionId={props.sessionId}
                  tasks={props.tasks}
                  bodies={props.bodies}
                  states={states}
                  results={props.mode === "practice" ? results : []}
                  hints={{}}
                  multiCluster={props.clusters.length > 1}
                  canAct={started}
                  onShowHint={() => undefined}
                  onFlagsChange={setFlags}
                  hideStates={props.mode === "exam"}
                  noun="Task"
                  renderActions={
                    props.mode === "practice"
                      ? (task) => (
                          <Button type="button" size="sm" variant="outline" className="self-start" disabled={checkingTask !== null} onClick={() => checkTask(task.id)}>
                            {checkingTask === task.id ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <CheckCircle2 aria-hidden="true" />}
                            {checkingTask === task.id ? en.labs.checking : en.mocks.checkTask}
                          </Button>
                        )
                      : undefined
                  }
                />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading the tasks…
                </p>
              )}
            </div>
            <div id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" hidden={tab !== "docs"} className="flex min-h-0 flex-1 flex-col">
              <DocsPanel links={props.docs} />
            </div>
          </div>
          <div className="flex min-h-[420px] flex-col">
            <TerminalPane sessionId={props.sessionId} onEnded={refresh} />
          </div>
        </div>
      )}
    </div>
  );
}

function PrepareScreen(props: {
  poll: Poll;
  elapsed: number;
  clusters: string[];
  taskCount: number;
  minutes: number;
  docs: DocsLink[];
  startWindowMinutes: number;
  skewMs: number;
  starting: boolean;
  onStart: () => void;
}) {
  const { poll } = props;
  const ready = poll.status === "ready";
  const failed = poll.status === "failed";
  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[1fr_minmax(360px,480px)]">
      <section aria-labelledby="rules" className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <div>
          <h1 id="rules" className="text-xl font-semibold">
            {en.mocks.rulesTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {props.taskCount} tasks · {props.minutes} minutes · clusters {props.clusters.join(", ")}
          </p>
        </div>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px]">
          {en.mocks.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div>
          <h2 className="text-sm font-semibold">Allowed documentation</h2>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {props.docs.map((d) => (
              <li key={d.url}>{d.title}</li>
            ))}
          </ul>
        </div>
      </section>
      <div className="flex flex-col gap-4">
        {ready ? (
          <section aria-labelledby="ready" className="flex flex-col gap-3 rounded-lg border border-success bg-card p-6">
            <h2 id="ready" className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
              Your clusters are ready
            </h2>
            <p className="text-[15px] text-muted-foreground">
              Press Start when you are ready. The {props.minutes}-minute clock starts then.
            </p>
            <Button type="button" onClick={props.onStart} disabled={props.starting} className="self-start">
              {props.starting ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Play aria-hidden="true" />}
              {en.mocks.start}
            </Button>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              Start window: <SessionTimer expiresAt={poll.expiresAt} skewMs={props.skewMs} what="start window" />
            </p>
            <p className="text-[13px] text-muted-foreground">{en.mocks.startWindow(props.startWindowMinutes)}</p>
          </section>
        ) : (
          <BootProgress step={poll.bootStep} message={poll.statusMessage} failed={failed} elapsedSeconds={props.elapsed} what="exam" />
        )}
        {failed ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Nothing counted against your attempts.</p>
            <Link href="/mocks" className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
              Back to mock exams
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
