import { Progress } from "@/components/ui/progress";
import type { Capacity, LabUsage } from "@/server/labs";

/** "2 of 3 lab slots in use (4 of 6 clusters), 1 waiting" */
export function capacitySummary(c: Capacity): string {
  const clusters = c.maxClusters !== null ? ` (${c.clusters} of ${c.maxClusters} clusters)` : "";
  const waiting = c.queue.length > 0 ? `, ${c.queue.length} waiting` : "";
  return `${c.sessions} of ${c.maxSessions} lab slots in use${clusters}${waiting}`;
}

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", timeZone: "UTC" });

/** Lab minutes used of the monthly allowance, the one-active-session rule and the platform's capacity. */
export function QuotaMeter({ usage, capacity }: { usage: LabUsage; capacity: Capacity }) {
  const pct = usage.monthlyMinutes > 0 ? Math.min(100, Math.round((usage.minutesUsed / usage.monthlyMinutes) * 100)) : 100;
  const state = !capacity.controllerUp ? "paused" : usage.minutesLeft === 0 ? "used up" : pct >= 80 ? "low" : "plenty";
  return (
    <section aria-labelledby="quota" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quota" className="text-base font-semibold">
          Lab time this month
        </h2>
        <span className="text-sm text-muted-foreground">Resets on {dateFmt.format(usage.resetsOn)}</span>
      </div>
      <p className="mt-2 text-[15px]">
        <strong>{usage.minutesLeft}</strong> of {usage.monthlyMinutes} minutes left
        <span className="text-muted-foreground"> · {state}</span>
      </p>
      <Progress value={pct} label={`${usage.minutesUsed} of ${usage.monthlyMinutes} lab minutes used`} className="mt-2 h-2" />
      <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
        <li>One lab at a time. Time counts from when your terminal is ready until you finish.</li>
        <li>
          {capacity.controllerUp
            ? `Runs on ${capacity.provider === "local-docker" ? "local Docker" : capacity.provider}: ${capacitySummary(capacity)}.`
            : "Lab controller offline: labs are paused."}
        </li>
      </ul>
    </section>
  );
}
