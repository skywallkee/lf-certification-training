"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, CircleDashed, Lightbulb, Loader2, XCircle } from "lucide-react";
import { taskStates, type CheckResult } from "@lfct/labs/status";
import { checkLabAction, extendLabAction, finishLabAction, revealHintAction } from "@/app/actions/labs";
import { SampleBadge } from "@/components/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { BootProgress } from "./boot-progress";
import { SessionTimer } from "./session-timer";
import { TerminalPane } from "./terminal-pane";

export interface PlayerTask {
  id: string;
  title: string;
  weight: number;
  hintsTotal: number;
  hints: string[];
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
  initial: { status: string; bootStep: number; statusMessage: string | null; expiresAt: string | null; extended: boolean; now: string; createdAt: string };
  lastCheck: { results: CheckResult[]; score: number; at: string } | null;
  extendMinutes: number;
}

type Poll = PlayerProps["initial"];

/**
 * Lab player: task panel on the left, terminal on the right, timer and actions on top, results under each
 * task. Polls the session while it boots and every few seconds after, so expiry and admin kills show up. F6
 * cycles focus between the toolbar, the task panel and the terminal.
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
  const toolbar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const ended = !["requested", "booting", "ready"].includes(poll.status);
  const ready = poll.status === "ready";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/labs/sessions/${props.sessionId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as Omit<Poll, "createdAt">;
    setSkewMs(new Date(next.now).getTime() - Date.now());
    setPoll((p) => ({ ...p, ...next }));
  }, [props.sessionId]);

  useEffect(() => {
    if (ended) return;
    const t = setInterval(refresh, ready ? 10_000 : 1500);
    return () => clearInterval(t);
  }, [ended, ready, refresh]);

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
              <Button type="button" size="sm" variant="outline" disabled={ended}>
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
                <form action={finishLabAction}>
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

      <div ref={mainRef} className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 xl:grid-cols-[minmax(340px,440px)_1fr] xl:overflow-hidden">
        <div
          ref={panel}
          tabIndex={-1}
          role="region"
          aria-label="Tasks"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-5"
        >
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
          <ol className="flex flex-col gap-5">
            {props.tasks.map((t, i) => {
              const st = checking ? "checking" : states[t.id];
              const results = check?.results.filter((r) => r.taskId === t.id) ?? [];
              const shown = hints[t.id] ?? [];
              return (
                <li key={t.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">
                      {i + 1}. {t.title}
                    </h2>
                    <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      {t.weight}% <TaskChip state={st ?? "unchecked"} />
                    </span>
                  </div>
                  <div className="mt-2 text-[15px]">{props.bodies[t.id]}</div>
                  {results.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1.5" aria-label={`Checks for task ${i + 1}`}>
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
                  {t.hintsTotal > 0 ? (
                    <div className="mt-3">
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
                      {shown.length < t.hintsTotal ? (
                        <Button type="button" size="sm" variant="ghost" disabled={!ready} onClick={() => showHint(t.id)}>
                          <Lightbulb aria-hidden="true" />
                          Show hint {shown.length + 1} of {t.hintsTotal}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex min-h-[420px] flex-col">
          {ready ? (
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

function TaskChip({ state }: { state: "passed" | "failed" | "unchecked" | "checking" }) {
  const map = {
    passed: { cls: "bg-success-soft text-success", Icon: CheckCircle2, label: "Passed" },
    failed: { cls: "bg-destructive-soft text-destructive", Icon: XCircle, label: "Not yet" },
    unchecked: { cls: "bg-muted text-muted-foreground", Icon: CircleDashed, label: "Not checked" },
    checking: { cls: "bg-primary-soft text-primary", Icon: Loader2, label: "Checking" },
  }[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", map.cls)}>
      <map.Icon aria-hidden="true" className={cn("size-3.5", state === "checking" && "animate-spin motion-reduce:animate-none")} />
      {map.label}
    </span>
  );
}
