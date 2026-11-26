import type { Metadata } from "next";
import Link from "next/link";
import { DomainWeightBar, weakestDomain } from "@/components/domain-weight-bar";
import { ReadinessHistory } from "@/components/readiness-history";
import { ReadinessRing } from "@/components/readiness-ring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { evidenceSummary, HALF_LIFE_DAYS, MIN_ANSWERS, MIN_DOMAINS } from "@/lib/readiness";
import { loadCert } from "@/server/cert-page";
import { getReadiness, getReadinessHistory } from "@/server/progress";
import { requireUser, getProfile } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Readiness" };

export default async function ReadinessPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { cert } = await loadCert(code);
  const user = await requireUser(`/certs/${code}/readiness`);
  const today = learnerToday(await getProfile(user.id));
  const [readiness, history] = await Promise.all([getReadiness(user.id, cert, today), getReadinessHistory(user.id, cert, today)]);
  const weakest = weakestDomain(readiness.domains);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
        <Link href="/certs">Certs</Link> / <Link href={`/certs/${code}`}>{cert.code}</Link> / <span aria-current="page">Readiness</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[30px] font-bold">{cert.code} readiness</h1>
        <Link href={`/practice?cert=${cert.code}${weakest ? `&domains=${weakest.key}` : ""}`} className={buttonVariants()}>
          {weakest ? `Practise ${weakest.name}` : `Practise ${cert.code}`}
        </Link>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="score">
          <CardTitle id="score" className="mb-4">Weighted score</CardTitle>
          <ReadinessRing readiness={readiness} size={120} />
          <p className="mt-4 text-sm text-muted-foreground">
            Each domain counts by its official weight. Mastery starts low and rises with right answers, passed lab tasks
            (worth 2 answers) and passed mock exam tasks (worth 3); a finished lesson nudges it up a little. Evidence older
            than {HALF_LIFE_DAYS} days counts half. A score appears after {MIN_ANSWERS} answers, or the same in lab and mock
            tasks, across at least {MIN_DOMAINS} domains.
          </p>
        </Card>
        <Card aria-labelledby="by-domain">
          <CardTitle id="by-domain" className="mb-4">By domain</CardTitle>
          <div className="flex flex-col gap-4">
            {readiness.domains.map((d) => (
              <div key={d.key}>
                <DomainWeightBar domain={d} weakest={d.key === weakest?.key} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.answers === 0 ? "No answers yet" : `${d.correct} of ${d.answers} right: ${evidenceSummary(d.bySource)}`}
                  {d.bySource.lesson > 0 ? ` · ${d.bySource.lesson} lesson${d.bySource.lesson === 1 ? "" : "s"} read` : ""}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card aria-labelledby="history" className="mt-6">
        <CardTitle id="history" className="mb-3">Last 8 weeks</CardTitle>
        <ReadinessHistory points={history} />
      </Card>
    </>
  );
}
