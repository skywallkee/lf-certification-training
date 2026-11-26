import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { QuotaMeter } from "@/components/labs/quota-meter";
import { StartLab } from "@/components/labs/start-lab";
import { SampleBadge } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { blockFor, getBootTimes, getCapacity, getHistory, getUsage, listLabs } from "@/server/labs";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Labs" };

export default async function LabsPage() {
  const user = await requireUser("/labs");
  const [labs, usage, capacity, catalog, bootTimes, history] = await Promise.all([
    listLabs(),
    getUsage(user.id),
    getCapacity(),
    getCatalog(),
    getBootTimes(),
    getHistory(user.id),
  ]);
  // Your runs per lab, newest first (getHistory's order), for "Last 75% · best 100% · 3 runs".
  const runs = new Map<string, number[]>();
  for (const s of history) if (s.score !== null) runs.set(s.labId, [...(runs.get(s.labId) ?? []), s.score]);
  const byCert = new Map<string, typeof labs>();
  for (const lab of labs) byCert.set(lab.certCode, [...(byCert.get(lab.certCode) ?? []), lab]);

  return (
    <>
      <PageHeader
        title={en.labs.title}
        lead={en.labs.lead}
        actions={
          <Link href="/labs/history" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Lab history
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <QuotaMeter usage={usage} capacity={capacity} />
        {labs.length === 0 ? (
          <Card>
            <p className="text-[15px] text-muted-foreground">No labs yet. Run pnpm curriculum:ingest to load the sample labs.</p>
          </Card>
        ) : (
          [...byCert].map(([cert, list]) => (
            <section key={cert} aria-labelledby={`cert-${cert}`}>
              <h2 id={`cert-${cert}`} className="mb-3 text-lg font-semibold">
                {cert} · {catalog.certs.get(cert)?.name ?? ""}
              </h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {list.map((lab) => (
                  <li key={lab.id}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <FlaskConical aria-hidden="true" className="size-4 text-primary" />
                        <h3 className="text-base font-semibold">
                          <Link href={`/labs/${lab.id}`}>{lab.title}</Link>
                        </h3>
                        {lab.mock ? <SampleBadge /> : null}
                      </div>
                      <p className="text-[15px] text-muted-foreground">{lab.summary}</p>
                      <p className="text-sm">
                        Tier {lab.tier} · {lab.minutes} min · {lab.tasks.length} task{lab.tasks.length === 1 ? "" : "s"} ·{" "}
                        {lab.tasks.reduce((n, t) => n + t.checks.length, 0)} checks
                      </p>
                      {runs.get(lab.id) ? (
                        <p className="text-sm text-muted-foreground">
                          Your last score {runs.get(lab.id)![0]}% · best {Math.max(...runs.get(lab.id)!)}% · {runs.get(lab.id)!.length} graded run
                          {runs.get(lab.id)!.length === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      <div className="mt-auto">
                        <StartLab lab={lab} usage={usage} block={blockFor(lab, usage, capacity)} bootSeconds={bootTimes.get(lab.id)} />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
