"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerState } from "@lfct/labs/player";

/**
 * The player's resumable state (exercise, flags, tab, docs page), saved on the server: a refresh, a closed tab
 * or another browser opens the lab or exam where the learner left it. Saves are debounced; a pending save is
 * sent with sendBeacon when the page goes away.
 */
export function usePlayerState(sessionId: string, initial: PlayerState): [PlayerState, (patch: Partial<PlayerState>) => void] {
  const [state, setState] = useState(initial);
  const pending = useRef<PlayerState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const url = `/api/labs/sessions/${sessionId}/state`;

  const flush = useCallback(
    (beacon: boolean) => {
      clearTimeout(timer.current);
      const body = pending.current;
      if (!body) return;
      pending.current = null;
      const json = JSON.stringify(body);
      if (beacon && navigator.sendBeacon?.(url, new Blob([json], { type: "application/json" }))) return;
      void fetch(url, { method: "POST", body: json, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    },
    [url],
  );

  const update = useCallback(
    (patch: Partial<PlayerState>) => {
      setState((s) => {
        const next = { ...s, ...patch };
        pending.current = next;
        return next;
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(false), 400);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [flush]);

  return [state, update];
}
