"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { BookOpen, ListChecks, Loader2 } from "lucide-react";
import type { PlayerState } from "@lfct/labs/player";
import { taskStates, type CheckResult } from "@lfct/labs/status";
import { checkLabAction, extendLabAction, finishLabAction, revealHintAction } from "@/app/actions/labs";
import { SampleBadge } from "@/components/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { BootProgress } from "./boot-progress";
import { DocsPanel, type DocsLink } from "./docs-panel";
import { ExercisePanel } from "./exercise-panel";
import { SessionTimer } from "./session-timer";
import { TerminalPane } from "./terminal-pane";
import { usePlayerState } from "./use-player-state";
import { TabTitle } from "./tab-title";

export interface PlayerTask {
  id: string;
  title: string;
  weight: number;
  hintsTotal: number;
  hints: string[];
  /** The cluster (kubectl context) the exercise is about. */
  cluster: string;
  checks: { id: string }[];
}

export interface PlayerProps {
  sessionId: string;
  title: string;
  certCode: string;
  mock: boolean;
  tasks: PlayerTask[];
  /** Task bodies rendered on the server. */
  bodies: Record<string, ReactNode>;
  initial: {
    status: string;
    bootStep: number;
    statusMessage: string | null;
    expiresAt: string | null;
    extended: boolean;
    /** The controller is grading and deleting the lab. */
    ending: boolean;
    now: string;
    createdAt: string;
  };
  /** Where the learner was (exercise, flags, panel), saved on the server for resuming after a refresh. */
  playerState: PlayerState;
  lastCheck: { results: CheckResult[]; score: number; at: string } | null;
  extendMinutes: number;
  /** More than one cluster: each exercise names its kubectl context. */
  multiCluster: boolean;
  docs: DocsLink[];
}

type Poll = PlayerProps["initial"];

/**
 * Lab player: on the left, tabs for the exercises (one at a time, with flags and Previous/Next) and the
 * documentation; the terminal on the right; timer and actions on top. Polls the session while it boots and
 * every few seconds after, so expiry and admin kills show up. F6 cycles focus between the toolbar, the left
 * panel and the terminal.
 */
export function LabPlayer(props: PlayerProps) {
  const router = useRouter();
  const [poll, setPoll] = useState<Poll>(props.initial);
  const [skewMs, setSkewMs] = useState(() => new Date(props.initial.now).getTime() - Date.now());
  const [check, setCheck] = useState(props.lastCheck);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [hints, setHints] = useState<Record<string, string[]>>(() => Object.fromEntries(props.tasks.map((t) => [t.id, t.hints])));
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saved, save] = usePlayerState(props.sessionId, props.playerState);
  const tab = saved.tab === "docs" ? "docs" : "exercises";
  const setTab = (t: "exercises" | "docs") => save({ tab: t === "docs" ? "docs" : "tasks" });
  const [finishing, setFinishing] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const ended = !["requested", "booting", "ready"].includes(poll.status);
  const ending = !ended && (poll.ending || finishing);
  const ready = poll.status === "ready" && !ending;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/labs/sessions/${props.sessionId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as Omit<Poll, "createdAt">;
    setSkewMs(new Date(next.now).getTime() - Date.now());
    setPoll((p) => ({ ...p, ...next }));
  }, [props.sessionId]);

  useEffect(() => {
    if (ended) return;
    const t = setInterval(refresh, ready ? 10_000 : ending ? 2000 : 1500);
    return () => clearInterval(t);
  }, [ended, ready, ending, refresh]);

  useEffect(() => {
    if (poll.status === "finished" || poll.status === "expired" || poll.status === "killed") {
      router.replace(`/labs/history/${props.sessionId}`);
    }
  }, [poll.status, props.sessionId, router]);

  useEffect(() => {
    if (ready || ended) return;
    const start = new Date(props.initial.createdAt).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() + skewMs - start) / 1000))), 1000);
    return () => clearInterval(t);
  }, [ready, ended, props.initial.createdAt, skewMs]);

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

  const runCheck = () => {
    setCheckError(null);
    startChecking(async () => {
      const out = await checkLabAction(props.sessionId);
      if (out.ok) setCheck({ results: out.results, score: out.score, at: out.at });
      else setCheckError(out.error);
    });
  };

  const extend = async () => {
    const out = await extendLabAction(props.sessionId);
    if (out.ok) {
      setPoll((p) => ({ ...p, expiresAt: out.expiresAt, extended: true }));
      setNotice(`Added ${props.extendMinutes} minutes.`);
    } else setNotice(out.error);
  };

  const showHint = async (taskId: string) => {
    const out = await revealHintAction(props.sessionId, taskId);
    if (out.ok) setHints((h) => ({ ...h, [taskId]: [...(h[taskId] ?? []), out.text] }));
    else setNotice(out.error);
  };

  const states = taskStates(props.tasks, check?.results);
  const passed = check?.results.filter((r) => r.passed).length ?? 0;
  const total = check?.results.length ?? 0;

  return (
    <div className="flex h-dvh min-h-[600px] flex-col">
      <TabTitle label={ending ? "Grading" : poll.status === "failed" ? "Did not start" : ended ? null : ready ? null : "Starting"} expiresAt={ready ? poll.expiresAt : null} skewMs={skewMs} />
      <div
        ref={toolbar}
        tabIndex={-1}
        role="toolbar"
        aria-label="Lab controls"
        className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5 sm:px-6"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/labs" className="font-bold text-foreground no-underline hover:text-foreground">
            {en.appName}
          </Link>
          <span className="truncate text-sm font-semibold">{props.title}</span>
          <span className="text-[13px] text-muted-foreground">{props.certCode}</span>
          {props.mock ? <SampleBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SessionTimer expiresAt={poll.expiresAt} skewMs={skewMs} />
          <Button type="button" size="sm" variant="outline" disabled={!ready || poll.extended} onClick={extend}>
            {poll.extended ? en.labs.extended : en.labs.extend(props.extendMinutes)}
          </Button>
          <Button type="button" size="sm" disabled={!ready || checking} onClick={runCheck}>
            {checking ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
            {checking ? en.labs.checking : en.labs.check}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={ended || ending}>
                Finish
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{en.labs.finishTitle}</DialogTitle>
              <DialogDescription>{en.labs.finishBody}</DialogDescription>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {en.labs.keepWorking}
                  </Button>
                </DialogClose>
                <form action={finishLabAction} onSubmit={() => setFinishing(true)}>
                  <input type="hidden" name="session" value={props.sessionId} />
                  <FinishSubmit />
                </form>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <p className="border-b bg-warning-soft px-4 py-2 text-sm md:hidden">Labs work best on a larger screen with a keyboard.</p>
      {notice ? (
        <p role="status" className="border-b bg-primary-soft px-4 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div
        ref={mainRef}
        className={cn(
          "grid min-h-0 flex-1 gap-4 overflow-auto p-4 xl:overflow-hidden",
          tab === "docs" ? "xl:grid-cols-[minmax(420px,1fr)_minmax(0,1fr)]" : "xl:grid-cols-[minmax(340px,460px)_1fr]",
        )}
      >
        <div ref={panel} tabIndex={-1} role="region" aria-label="Exercises and documentation" className="flex min-h-0 flex-col gap-4 rounded-lg border bg-card p-5">
          <div role="tablist" aria-label="Left panel" className="flex gap-1 rounded-md bg-muted p-1">
            {(
              [
                ["exercises", "Exercises", ListChecks],
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

          <div id="panel-exercises" role="tabpanel" aria-labelledby="tab-exercises" hidden={tab !== "exercises"} className="flex min-h-0 flex-1 flex-col gap-4">
            <div aria-live="polite" className="text-sm">
              {checkError ? (
                <p className="rounded-md bg-destructive-soft px-3 py-2 text-destructive">{checkError}</p>
              ) : check ? (
                <p className="rounded-md bg-muted px-3 py-2">
                  <strong>{en.labs.checkSummary(passed, total)}</strong> Score so far: {check.score}%.
                </p>
              ) : (
                <p className="text-muted-foreground">{ready ? en.labs.noChecksYet : en.labs.booting}</p>
              )}
            </div>
            <ExercisePanel
              sessionId={props.sessionId}
              tasks={props.tasks}
              bodies={props.bodies}
              states={checking ? Object.fromEntries(props.tasks.map((t) => [t.id, "checking" as const])) : states}
              results={check?.results ?? []}
              hints={hints}
              multiCluster={props.multiCluster}
              canAct={ready}
              onShowHint={showHint}
              current={saved.current}
              flags={saved.flags}
              onCurrentChange={(current) => save({ current })}
              onFlagsChange={(flags) => save({ flags })}
            />
          </div>
          {/* Kept mounted while hidden so the page the learner was reading stays put. */}
          <div id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" hidden={tab !== "docs"} className="flex min-h-0 flex-1 flex-col">
            <DocsPanel links={props.docs} selected={saved.doc} onSelect={(doc) => save({ doc })} />
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col">
          {ending ? (
            <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border bg-card p-8 text-center">
              <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary motion-reduce:animate-none" />
              <h2 className="text-lg font-semibold">Grading and deleting your lab…</h2>
              <p className="text-sm text-muted-foreground">Your results open here when it is done.</p>
            </section>
          ) : ready ? (
            <TerminalPane sessionId={props.sessionId} onEnded={refresh} />
          ) : poll.status === "failed" ? (
            <div className="flex flex-1 flex-col gap-4">
              <BootProgress step={poll.bootStep} message={poll.statusMessage} failed elapsedSeconds={elapsed} />
              <Link href="/labs" className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
                Back to labs
              </Link>
            </div>
          ) : (
            <BootProgress step={poll.bootStep} message={poll.statusMessage} failed={false} elapsedSeconds={elapsed} />
          )}
        </div>
      </div>
    </div>
  );
}

function FinishSubmit() {
  const [pending, setPending] = useState(false);
  return (
    <Button type="submit" variant="destructive" onClick={() => setPending(true)} aria-disabled={pending}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
      {pending ? "Grading and deleting…" : en.labs.finishConfirm}
    </Button>
  );
}
