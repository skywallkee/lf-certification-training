import Link from "next/link";
import type { StartBlock } from "@lfct/labs";
import { startLabAction } from "@/app/actions/labs";
import { Button, buttonVariants } from "@/components/ui/button";
import { en } from "@/messages/en";
import { bootEstimate, type LabRow, type LabUsage } from "@/server/labs";

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
      return en.labs.capacity;
    case "controller-down":
      return en.labs.controllerDown;
  }
}

/** Start button with the scarcity line ("About 1 minute to start · uses up to 30 of your 600 lab minutes"). */
export function StartLab({ lab, usage, block }: { lab: Pick<LabRow, "id" | "tier" | "minutes">; usage: LabUsage; block: StartBlock | null }) {
  if (block?.reason === "active-session") {
    return (
      <div className="flex flex-col gap-2">
        <Link href={`/labs/sessions/${block.sessionId}`} className={buttonVariants({ variant: "outline" })}>
          {usage.active?.labId === lab.id ? "Resume this lab" : "Go to your running lab"}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <form action={startLabAction}>
        <input type="hidden" name="lab" value={lab.id} />
        <Button type="submit" disabled={block !== null}>
          Start lab
        </Button>
      </form>
      <p className="text-[13px] text-muted-foreground">
        {bootEstimate(lab.tier)} · uses up to {lab.minutes} of your {usage.minutesLeft} remaining lab minutes
      </p>
      {block ? (
        <p role="status" className="max-w-[60ch] rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          {blockMessage(block, usage, lab.minutes)}
        </p>
      ) : null}
    </div>
  );
}
