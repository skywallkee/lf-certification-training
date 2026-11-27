import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ACTIVE_STATUSES, minutesUsed, monthStart } from "@lfct/labs";
import { killLabAction } from "@/app/actions/labs";
import { PageHeader } from "@/components/page-header";
import { SessionStatus, dateTime } from "@/components/labs/session-status";
import { capacitySummary } from "@/components/labs/quota-meter";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { labSession, user as userTable } from "@/db/schema";
import { getCapacity, listLabs } from "@/server/labs";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin: labs" };

const usd = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

export default async function AdminLabsPage() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const [live, month, labs, capacity] = await Promise.all([
    db
      .select({ s: labSession, email: userTable.email })
      .from(labSession)
      .innerJoin(userTable, eq(userTable.id, labSession.userId))
      .where(inArray(labSession.status, [...ACTIVE_STATUSES]))
      .orderBy(desc(labSession.createdAt)),
    db.select().from(labSession).where(and(gte(labSession.createdAt, monthStart(now)))),
    listLabs(),
    getCapacity(),
  ]);
  const titles = new Map(labs.map((l) => [l.id, l.title]));
  const byProvider = new Map<string, { sessions: number; minutes: number; cents: number; failed: number }>();
  for (const s of month) {
    const p = byProvider.get(s.provider) ?? { sessions: 0, minutes: 0, cents: 0, failed: 0 };
    p.sessions += 1;
    p.minutes += minutesUsed([s], now);
    p.cents += s.costCents;
    if (s.status === "failed") p.failed += 1;
    byProvider.set(s.provider, p);
  }

  return (
    <>
      <PageHeader title="Labs: sessions and spend" eyebrow={<Link href="/admin">Admin</Link>} lead="Live sessions, this month's usage per provider, and a kill switch." />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="live">
          <CardTitle id="live">Live sessions</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {capacity.controllerUp ? `Lab controller online (${capacity.provider}).` : "Lab controller offline."} {capacitySummary(capacity)}.
          </p>
          {live.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted-foreground">No labs are running.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 font-semibold">Learner</th>
                    <th scope="col" className="py-2 font-semibold">Lab</th>
                    <th scope="col" className="py-2 font-semibold">Status</th>
                    <th scope="col" className="py-2 font-semibold">Started (UTC)</th>
                    <th scope="col" className="py-2 font-semibold">Ends (UTC)</th>
                    <th scope="col" className="py-2 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {live.map(({ s, email }) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2">{email}</td>
                      <td className="py-2">{titles.get(s.labId) ?? s.labId}</td>
                      <td className="py-2">
                        <SessionStatus status={s.status} />
                      </td>
                      <td className="py-2">{dateTime.format(s.createdAt)}</td>
                      <td className="py-2">{s.expiresAt ? dateTime.format(s.expiresAt) : "–"}</td>
                      <td className="py-2 text-right">
                        <form action={killLabAction}>
                          <input type="hidden" name="session" value={s.id} />
                          <Button type="submit" size="sm" variant="destructive" aria-label={`Kill the lab of ${email}`}>
                            Kill
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card aria-labelledby="spend">
          <CardTitle id="spend">This month</CardTitle>
          {byProvider.size === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">No lab sessions this month.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 font-semibold">Provider</th>
                    <th scope="col" className="py-2 font-semibold">Sessions</th>
                    <th scope="col" className="py-2 font-semibold">Failed starts</th>
                    <th scope="col" className="py-2 font-semibold">Lab minutes</th>
                    <th scope="col" className="py-2 font-semibold">Estimated spend</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byProvider].map(([provider, p]) => (
                    <tr key={provider} className="border-t">
                      <td className="py-2">{provider === "local-docker" ? "Local Docker" : provider}</td>
                      <td className="py-2">{p.sessions}</td>
                      <td className="py-2">{p.failed}</td>
                      <td className="py-2">{p.minutes}</td>
                      <td className="py-2">{usd.format(p.cents / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">Local Docker costs nothing. Cloud providers and their monthly caps arrive with the infrastructure phase.</p>
        </Card>
      </div>
    </>
  );
}
