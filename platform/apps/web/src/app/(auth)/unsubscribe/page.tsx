import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAction } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { unsubscribeKind, verifyUnsubscribe } from "@/server/unsubscribe";

export const metadata: Metadata = { title: "Stop emails" };

const COPY = {
  reminders: {
    doneTitle: "Reminders stopped",
    done: "You will not get study reminder emails any more. Account emails, such as password resets, still arrive.",
    again: "Turn them back on under",
    anchor: "/account#reminders",
    askTitle: "Stop study reminders?",
    ask: "This turns off the weekly plan, the nudges and the exam countdown emails. Account emails still arrive.",
    button: "Stop all reminders",
    fix: "Sign in and turn reminders off under",
  },
  discussions: {
    doneTitle: "Discussion emails stopped",
    done: "You will not get emails about discussions any more. You still follow them in the app, and account emails still arrive.",
    again: "Turn them back on under",
    anchor: "/account#discussion-emails",
    askTitle: "Stop discussion emails?",
    ask: "This turns off emails about new posts and replies in discussions you follow, and about accepted answers. Account emails still arrive.",
    button: "Stop discussion emails",
    fix: "Sign in and turn discussion emails off under",
  },
} as const;

/**
 * The link at the bottom of every reminder and discussion email. Opening it changes nothing (mail scanners open
 * links); the button does. Works without signing in.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; k?: string; done?: string; invalid?: string }>;
}) {
  const { u, t, k, done, invalid } = await searchParams;
  const kind = unsubscribeKind(k);
  const c = COPY[kind];
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{c.doneTitle}</h1>
        <p role="status" className="text-[15px]">
          {c.done}
        </p>
        <p className="text-[15px] text-muted-foreground">
          Changed your mind? {c.again} <Link href={c.anchor}>Account</Link>.
        </p>
      </div>
    );
  }
  const valid = !invalid && verifyUnsubscribe(u, t, kind) !== null;
  if (!valid) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">This link does not work</h1>
        <p className="text-[15px]">
          It may be incomplete. {c.fix} <Link href={c.anchor}>Account</Link>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{c.askTitle}</h1>
      <p className="text-[15px]">{c.ask}</p>
      <form action={unsubscribeAction}>
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="k" value={kind} />
        <Button type="submit">{c.button}</Button>
      </form>
    </div>
  );
}
