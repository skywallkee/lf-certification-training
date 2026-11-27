import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MOCK_MODES, START_WINDOW_MINUTES, type MockMode } from "@lfct/labs";
import { StartMock, mockBlockMessage } from "@/components/mocks/start-mock";
import { DraftBadge, SampleBadge } from "@/components/status-chip";
import { Card, CardTitle } from "@/components/ui/card";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { bootEstimate, canOpen, getBootTimes, getCapacity, getUsage, queueEntryFor } from "@/server/labs";
import { domainName, getMock, getMockAttemptsUsed, mockAllowance, mockBlockFor, usedFor } from "@/server/mocks";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const mock = await getMock((await params).id);
  return { title: mock ? mock.title : "Mock exam" };
}

export default async function MockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blocked?: string; mode?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/mocks/${id}`);
  const mock = await getMock(id);
  if (!mock || !canOpen(mock, user)) notFound();
  const [used, usage, capacity, catalog, bootTimes] = await Promise.all([getMockAttemptsUsed(user.id), getUsage(user.id), getCapacity(), getCatalog(), getBootTimes()]);
  const { blocked, mode: modeParam } = await searchParams;
  const initialMode: MockMode = modeParam === "practice" ? "practice" : "exam";
  const modes = MOCK_MODES.map((mode) => ({
    mode,
    used: usedFor(used, mock.certCode, mode),
    allowed: mockAllowance(mode),
    block: mockBlockFor(mock, mode, used, usage, capacity),
  }));
  const blockedNow = blocked ? modes.find((m) => m.mode === initialMode)?.block : null;
  const cert = catalog.certs.get(mock.certCode);
  // Tasks stay hidden until Start, as in the exam; show what the attempt covers instead.
  const domains = new Map<string, { tasks: number; weight: number }>();
  for (const t of mock.tasks) {
    const key = t.competency?.split("/")[1] ?? "other";
    const d = domains.get(key) ?? { tasks: 0, weight: 0 };
    domains.set(key, { tasks: d.tasks + 1, weight: d.weight + t.weight });
  }

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/mocks">Mock exams</Link> / <span aria-current="page">{mock.certCode}</span>
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">{mock.title}</h1>
          {mock.mock ? <SampleBadge /> : null}
          {mock.published ? null : <DraftBadge />}
        </div>
        <p className="max-w-[72ch] text-[15px] text-muted-foreground">{mock.summary}</p>
        <p className="text-sm">
          {mock.certCode} · {mock.minutes} minutes · {mock.tasks.length} tasks · {mock.clusters.length} clusters ({mock.clusters.join(", ")}) · pass mark{" "}
          {mock.passPercent ?? 66}%
        </p>
      </header>
      {blockedNow && blockedNow.reason !== "capacity" ? (
        <p role="alert" className="max-w-[72ch] rounded-md bg-warning-soft px-4 py-3 text-[15px]">
          {mockBlockMessage(blockedNow, initialMode)}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="rules">
            <CardTitle id="rules">{en.mocks.rulesTitle}</CardTitle>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px]">
              {en.mocks.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
              <li>{en.mocks.startWindow(START_WINDOW_MINUTES)}</li>
            </ul>
          </Card>
          <Card aria-labelledby="covers">
            <CardTitle id="covers">What it covers</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Task statements appear when you press Start, as in the exam.</p>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Domain</th>
                  <th scope="col" className="py-2 font-semibold">Tasks</th>
                  <th scope="col" className="py-2 font-semibold">Weight</th>
                </tr>
              </thead>
              <tbody>
                {[...domains].map(([key, d]) => (
                  <tr key={key} className="border-t">
                    <td className="py-2">{domainName(cert, key)}</td>
                    <td className="py-2">{d.tasks}</td>
                    <td className="py-2">{d.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card aria-labelledby="start">
            <CardTitle id="start">Take it</CardTitle>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              You get {mock.clusters.length} fresh single-node clusters, one kubectl context each, a terminal, the official docs, and {mock.minutes} minutes.{" "}
              {bootEstimate(mock.tier, bootTimes.get(mock.id))}; the clock starts only when you press Start.
            </p>
            <StartMock mockId={mock.id} modes={modes} initialMode={initialMode} queued={queueEntryFor(user.id, capacity)} />
          </Card>
          {mock.docs.length > 0 ? (
            <Card aria-labelledby="docs">
              <CardTitle id="docs">Docs you may use</CardTitle>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {mock.docs.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noreferrer">
                      {d.title}
                    </a>
                  </li>
                ))}
                <li>Anything else under kubernetes.io/docs</li>
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </article>
  );
}
