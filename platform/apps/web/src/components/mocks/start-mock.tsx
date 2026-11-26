import Link from "next/link";
import type { MockMode, MockStartBlock } from "@lfct/labs";
import { startMockAction } from "@/app/actions/mocks";
import { Button, buttonVariants } from "@/components/ui/button";
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
      return en.mocks.capacity;
    case "controller-down":
      return en.mocks.controllerDown;
  }
}

/**
 * Mode choice (exam by default) and the Prepare button. Each mode shows its attempts left this month; a mode
 * whose allowance is used up cannot be picked.
 */
export function StartMock({ mockId, modes, initialMode = "exam" }: { mockId: string; modes: ModeState[]; initialMode?: MockMode }) {
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
  const preferred = modes.find((m) => m.mode === initialMode && !m.block) ?? modes.find((m) => !m.block);
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
        {en.mocks.prepare}
      </Button>
      <p className="text-[13px] text-muted-foreground">{en.mocks.prepareNote}</p>
      {shared?.block ? (
        <p role="status" className="max-w-[60ch] rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          {mockBlockMessage(shared.block, shared.mode)}
        </p>
      ) : null}
    </form>
  );
}
