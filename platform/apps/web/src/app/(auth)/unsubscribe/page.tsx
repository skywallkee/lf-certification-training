import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAction } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { verifyUnsubscribe } from "@/server/unsubscribe";

export const metadata: Metadata = { title: "Stop study reminders" };

/**
 * The link at the bottom of every reminder email. Opening it changes nothing (mail scanners open links); the
 * button does. Works without signing in.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string; invalid?: string }> }) {
  const { u, t, done, invalid } = await searchParams;
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Reminders stopped</h1>
        <p role="status" className="text-[15px]">
          You will not get study reminder emails any more. Account emails, such as password resets, still arrive.
        </p>
        <p className="text-[15px] text-muted-foreground">
          Changed your mind? Turn them back on under <Link href="/account#reminders">Account</Link>.
        </p>
      </div>
    );
  }
  const valid = !invalid && verifyUnsubscribe(u, t) !== null;
  if (!valid) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">This link does not work</h1>
        <p className="text-[15px]">
          It may be incomplete. Sign in and turn reminders off under <Link href="/account#reminders">Account</Link>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Stop study reminders?</h1>
      <p className="text-[15px]">This turns off the weekly plan, the nudges and the exam countdown emails. Account emails still arrive.</p>
      <form action={unsubscribeAction}>
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t} />
        <Button type="submit">Stop all reminders</Button>
      </form>
    </div>
  );
}
