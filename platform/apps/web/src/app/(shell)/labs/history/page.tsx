import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { SessionStatus, durationLabel } from "@/components/labs/session-status";
import { Card } from "@/components/ui/card";
import { getHistory, listLabs } from "@/server/labs";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Lab history" };

export default async function LabHistoryPage() {
  const user = await requireUser("/labs/history");
  const [sessions, labs] = await Promise.all([getHistory(user.id), listLabs()]);
  const titles = new Map(labs.map((l) => [l.id, l.title]));
  return (
    <>
      <PageHeader title="Lab history" eyebrow={<Link href="/labs">Labs</Link>} lead="Every lab you ran, with its final checks and the reference solution." />
      {sessions.length === 0 ? (
        <Card>
          <p className="text-[15px] text-muted-foreground">
            No labs yet. <Link href="/labs">Pick a lab</Link> to run your first one.
          </p>
        </Card>
      ) : (
        <Card className="relative overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Lab</th>
                <th scope="col" className="px-5 py-3 font-semibold">Started</th>
                <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                <th scope="col" className="px-5 py-3 font-semibold">Time used</th>
                <th scope="col" className="px-5 py-3 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-5 py-3">
                    <Link href={`/labs/history/${s.id}`}>{titles.get(s.labId) ?? s.labId}</Link>
                  </td>
                  <td className="px-5 py-3"><LocalTime value={s.createdAt} /></td>
                  <td className="px-5 py-3">
                    <SessionStatus status={s.status} />
                  </td>
                  <td className="px-5 py-3">{durationLabel(s.readyAt, s.endedAt)}</td>
                  <td className="px-5 py-3">{s.score === null ? "–" : `${s.score}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
