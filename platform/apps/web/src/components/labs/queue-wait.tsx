"use client";

import { useEffect, useRef, useState } from "react";
import { QUEUE_POLL_SECONDS } from "@lfct/labs/capacity";
import { leaveQueueAction, startLabAction } from "@/app/actions/labs";
import { startMockAction } from "@/app/actions/mocks";
import { Button } from "@/components/ui/button";
import { en } from "@/messages/en";

interface QueueState {
  queued: boolean;
  position?: number;
  waiting?: number;
  turn?: boolean;
  labId?: string;
}

/**
 * The learner's place in line while every slot on the machine is taken. The page checks in every few seconds
 * (that keeps the place); on their turn it presses Start for them, so the lab boots without another click.
 * Closing the page gives the place up after a short while.
 */
export function QueueWait({
  kind,
  id,
  mode,
  position: initialPosition,
  waiting: initialWaiting,
}: {
  kind: "lab" | "mock";
  id: string;
  mode?: string;
  position: number;
  waiting: number;
}) {
  const [state, setState] = useState<QueueState>({
    queued: true,
    position: initialPosition,
    waiting: initialWaiting,
  });
  const startForm = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  const back = `/${kind === "lab" ? "labs" : "mocks"}/${id}`;

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/labs/queue", {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok || stop) return;
        const next = (await res.json()) as QueueState;
        setState(next);
        if (next.queued && next.turn && next.labId === id && !started.current) {
          started.current = true;
          startForm.current?.requestSubmit();
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      }
    };
    void tick();
    const timer = setInterval(tick, QUEUE_POLL_SECONDS * 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    if (!state.queued || !state.position) return;
    const base = document.title.replace(/^(#\d+ in line|Your turn) · /, "");
    document.title = `${state.turn ? "Your turn" : `#${state.position} in line`} · ${base}`;
    return () => {
      document.title = base;
    };
  }, [state.queued, state.position, state.turn]);

  const what = kind === "lab" ? "lab" : "mock exam";
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary-soft p-4">
      <form
        ref={startForm}
        action={kind === "lab" ? startLabAction : startMockAction}
        hidden
      >
        <input
          type="hidden"
          name={kind === "lab" ? "lab" : "mock"}
          value={id}
        />
        {mode ? <input type="hidden" name="mode" value={mode} /> : null}
      </form>
      <p role="status" aria-live="polite" className="text-[15px]">
        {!state.queued
          ? en.labs.queueLeft
          : state.turn
            ? en.labs.queueTurn(what)
            : en.labs.queuePosition(
                state.position ?? initialPosition,
                state.waiting ?? initialWaiting,
                what,
              )}
      </p>
      {state.queued ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            {en.labs.queueKeepOpen}
          </p>
          <form action={leaveQueueAction}>
            <input type="hidden" name="back" value={back} />
            <Button type="submit" variant="outline" size="sm">
              Leave the line
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
