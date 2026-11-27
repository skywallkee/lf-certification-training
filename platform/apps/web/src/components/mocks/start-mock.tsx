import Link from "next/link";
import type { MockMode, MockStartBlock } from "@lfct/labs";
import { startMockAction } from "@/app/actions/mocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { QueueWait } from "@/components/labs/queue-wait";
import { en } from "@/messages/en";

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", timeZone: "UTC" });

export interface ModeState {
  mode: MockMode;
  used: number;
  allowed: number;
  block: MockStartBlock | null;
}

export function mockBlockMessage(block: MockStartBlock, mode: MockMode): string {
  switch (block.reason) {
    case "active-session":
      return en.mocks.activeSession;
    case "quota":
      return en.mocks.quota(block.allowed, mode === "exam" ? "exam-mode" : "practice-mode", dateFmt.format(block.resetsOn));
    case "capacity":
      return en.mocks.capacity(block.waiting);
    case "controller-down":
      return en.mocks.controllerDown;
  }
}

/**
 * Mode choice (exam by default) and the Prepare button. Each mode shows its attempts left this month; a mode
 * whose allowance is used up cannot be picked.
 */
export function StartMock({
  mockId,
  modes,
  initialMode = "exam",
  queued,
}: {
  mockId: string;
  modes: ModeState[];
  initialMode?: MockMode;
  /** The learner's place in line, when they are waiting for any lab or mock. */
  queued?: { labId: string; mode: string; position: number } | null | undefined;
}) {
  const active = modes.find((m) => m.block?.reason === "active-session")?.block;
  if (active?.reason === "active-session") {
    return (
      <div className="flex flex-col gap-2">
        <Link href={`/labs/sessions/${active.sessionId}`} className={buttonVariants({ variant: "outline" })}>
          Go to your running session
        </Link>
        <p className="text-[13px] text-muted-foreground">{en.mocks.activeSession}</p>
      </div>
    );
  }
  const capacity = modes.find((m) => m.block?.reason === "capacity")?.block;
  if (capacity?.reason === "capacity" && capacity.position !== null && queued?.labId === mockId) {
    return <QueueWait kind="mock" id={mockId} mode={queued.mode} position={capacity.position} waiting={capacity.waiting} />;
  }
  // A full server does not stop the choice: Prepare becomes "Join the line".
  const open = (m: ModeState) => !m.block || m.block.reason === "capacity";
  const preferred = modes.find((m) => m.mode === initialMode && open(m)) ?? modes.find(open);
  const shared = modes.every((m) => m.block) ? (modes.find((m) => m.mode === initialMode) ?? modes[0]) : null;
  return (
    <form action={startMockAction} className="flex flex-col gap-3">
      <input type="hidden" name="mock" value={mockId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Mode</legend>
        {modes.map((m) => {
          const label = m.mode === "exam" ? en.mocks.examMode : en.mocks.practiceMode;
          const hint = m.mode === "exam" ? en.mocks.examModeHint : en.mocks.practiceModeHint;
          const disabled = m.block?.reason === "quota";
          return (
            <label
              key={m.mode}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input type="radio" name="mode" value={m.mode} defaultChecked={preferred?.mode === m.mode} disabled={disabled} className="mt-1 accent-[var(--primary)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {label} <span className="font-normal text-muted-foreground">· {en.mocks.left(m.used, m.allowed)}</span>
                </span>
                <span className="text-[13px] text-muted-foreground">{hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button type="submit" disabled={!preferred} className="self-start">
        {preferred?.block?.reason === "capacity" ? en.labs.joinQueue : en.mocks.prepare}
      </Button>
      <p className="text-[13px] text-muted-foreground">{en.mocks.prepareNote}</p>
      {shared?.block ? (
        <p role="status" className="max-w-[60ch] rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          {mockBlockMessage(shared.block, shared.mode)}
        </p>
      ) : null}
      {queued && queued.labId !== mockId ? <p className="max-w-[60ch] text-[13px] text-muted-foreground">{en.labs.queueElsewhere}</p> : null}
    </form>
  );
}
