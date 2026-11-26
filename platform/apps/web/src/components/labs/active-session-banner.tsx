"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical, Timer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SessionTimer } from "./session-timer";

export interface ActiveSessionInfo {
  id: string;
  title: string;
  /** "lab", or "exam"/"practice" for a mock exam attempt. */
  mode: string;
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  now: string;
}

/**
 * A slim bar on every page while the learner has a lab or mock exam running, so leaving the player (or closing
 * the tab) never loses it: the time left and a way back in.
 */
export function ActiveSessionBanner({ session }: { session: ActiveSessionInfo }) {
  const [skewMs, setSkewMs] = useState(0);
  useEffect(() => setSkewMs(new Date(session.now).getTime() - Date.now()), [session.now]);
  const lab = session.mode === "lab";
  const href = lab ? `/labs/sessions/${session.id}` : `/mocks/attempts/${session.id}`;
  const running = session.status === "ready";
  const waitingForStart = !lab && running && !session.startedAt;
  const what = lab
    ? running
      ? "Your lab is running"
      : "Your lab is starting"
    : waitingForStart
      ? "Your mock exam is ready to start"
      : running
        ? "Your mock exam is in progress"
        : "Your mock exam is being prepared";
  const Icon = lab ? FlaskConical : Timer;
  return (
    <aside aria-label="Running session" className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary-soft px-4 py-2 sm:px-6">
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <strong>{what}:</strong>
        <span className="truncate">{session.title}</span>
      </p>
      <div className="flex items-center gap-2">
        {running && !waitingForStart ? <SessionTimer expiresAt={session.expiresAt} skewMs={skewMs} what={lab ? "lab" : "exam"} /> : null}
        <Link href={href} className={buttonVariants({ size: "sm" })}>
          {lab ? "Back to the lab" : "Back to the exam"}
        </Link>
      </div>
    </aside>
  );
}
