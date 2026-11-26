"use client";

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Time left in the lab, from the server's expiry (corrected for clock skew). Warns at 10 minutes and announces
 * 10 and 2 minutes left through a polite live region.
 */
export function SessionTimer({
  expiresAt,
  skewMs,
  what = "lab",
  waitingLabel = "Timer starts when your terminal is ready",
}: {
  expiresAt: string | null;
  skewMs: number;
  /** "lab" or "exam", for the announcements. */
  what?: string;
  waitingLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(new Set<number>());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - (now + skewMs)) : null;
  const minutes = left === null ? null : Math.floor(left / 60_000);

  useEffect(() => {
    if (minutes === null) return;
    for (const mark of [10, 2]) {
      if (minutes < mark && !announced.current.has(mark)) {
        announced.current.add(mark);
        if (minutes >= mark - 1) setAnnouncement(`${mark} minutes left in this ${what}.`);
      }
    }
  }, [minutes, what]);

  const label = left === null ? null : formatLeft(left);

  if (left === null) {
    return <span className="text-sm text-muted-foreground">{waitingLabel}</span>;
  }
  const state = left === 0 ? "expired" : left < 2 * 60_000 ? "critical" : left < 10 * 60_000 ? "warning" : "normal";
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
          state === "normal" && "bg-muted text-foreground",
          state === "warning" && "bg-warning-soft text-warning",
          (state === "critical" || state === "expired") && "bg-destructive-soft text-destructive",
        )}
      >
        <Clock aria-hidden="true" className="size-4" />
        <span className="sr-only">Time left: </span>
        {label}
      </span>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

/** "1:05:09", "04:59", or "Time is up". */
export function formatLeft(left: number): string {
  if (left <= 0) return "Time is up";
  const hours = Math.floor(left / 3_600_000);
  const mm = String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
