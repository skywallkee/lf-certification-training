import Link from "next/link";
import type { StartBlock } from "@lfct/labs";
import { startLabAction } from "@/app/actions/labs";
import { Button, buttonVariants } from "@/components/ui/button";
import { en } from "@/messages/en";
import { bootEstimate, type LabRow, type LabUsage } from "@/server/labs";
import { QueueWait } from "./queue-wait";

const monthFmt = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", timeZone: "UTC" });

/** Why a start is refused, in the spec's words, shown before the learner commits time. */
export function blockMessage(block: StartBlock, usage: LabUsage, labMinutes: number): string {
  switch (block.reason) {
    case "active-session":
      return en.labs.activeSession;
    case "quota":
      return usage.minutesLeft === 0
        ? en.labs.quotaUsed(monthFmt.format(new Date()), dateFmt.format(block.resetsOn), usage.monthlyMinutes)
        : `This lab takes ${labMinutes} minutes and you have ${usage.minutesLeft} left this month. They reset on ${dateFmt.format(block.resetsOn)}.`;
    case "capacity":
      return en.labs.capacity(block.waiting);
    case "controller-down":
      return en.labs.controllerDown;
  }
}

/**
 * Start button with the scarcity line ("About 1 minute to start · uses up to 30 of your 600 lab minutes"). When
 * the server is full it becomes "Join the line", and once the learner is in line for this lab, their place.
 */
export function StartLab({
  lab,
  usage,
  block,
  bootSeconds,
  queued,
}: {
  lab: Pick<LabRow, "id" | "tier" | "minutes">;
  usage: LabUsage;
  block: StartBlock | null;
  /** Typical boot time of this lab on this machine, when it has run before. */
  bootSeconds?: number | undefined;
  /** The learner's place in line, when they are waiting for any lab or mock. */
  queued?: { labId: string; position: number } | null | undefined;
}) {
  if (block?.reason === "active-session") {
    return (
      <div className="flex flex-col gap-2">
        <Link href={`/labs/sessions/${block.sessionId}`} className={buttonVariants({ variant: "outline" })}>
          {usage.active?.labId === lab.id ? "Resume this lab" : "Go to your running lab"}
        </Link>
      </div>
    );
  }
  if (block?.reason === "capacity" && block.position !== null && queued?.labId === lab.id) {
    return <QueueWait kind="lab" id={lab.id} position={block.position} waiting={block.waiting} />;
  }
  const join = block?.reason === "capacity";
  return (
    <div className="flex flex-col gap-2">
      <form action={startLabAction}>
        <input type="hidden" name="lab" value={lab.id} />
        <Button type="submit" disabled={block !== null && !join}>
          {join ? en.labs.joinQueue : "Start lab"}
        </Button>
      </form>
      <p className="text-[13px] text-muted-foreground">
        {bootEstimate(lab.tier, bootSeconds)} · uses up to {lab.minutes} of your {usage.minutesLeft} remaining lab minutes
      </p>
      {block ? (
        <p role="status" className="max-w-[60ch] rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          {blockMessage(block, usage, lab.minutes)}
        </p>
      ) : null}
      {queued && queued.labId !== lab.id ? <p className="max-w-[60ch] text-[13px] text-muted-foreground">{en.labs.queueElsewhere}</p> : null}
    </div>
  );
}
