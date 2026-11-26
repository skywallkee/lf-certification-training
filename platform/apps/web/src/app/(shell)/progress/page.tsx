import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { weakestDomain } from "@/components/domain-weight-bar";
import { Sparkline } from "@/components/mocks/score-trend";
import { PageHeader } from "@/components/page-header";
import { ReadinessRing } from "@/components/readiness-ring";
import { StatusChip } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatLong } from "@/lib/dates";
import { pct } from "@/lib/readiness";
import { getCatalog } from "@/server/catalog";
import { getDashboard, type CertProgress } from "@/server/dashboard";
import { getStreak } from "@/server/progress";
import { requireOnboarded } from "@/server/session";
import { learnerToday } from "@/server/today";

export const metadata: Metadata = { title: "Progress" };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Source({ label, value, detail, href }: { label: string; value: string; detail: string; href?: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2.5">
      <dt className="text-[13px] text-muted-foreground">{href ? <Link href={href}>{label}</Link> : label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}

function CertCard({ p }: { p: CertProgress }) {
  const code = p.cert.code;
  const lower = code.toLowerCase();
  const weakest = p.readiness.sufficient ? weakestDomain(p.readiness.domains) : undefined;
  const trend = p.history.map((h) => (h.score === null ? null : Math.round(h.score * 100)));
  const scored = trend.filter((v): v is number => v !== null);
  const change = scored.length >= 2 ? scored.at(-1)! - scored[0]! : null;
  const id = `cert-${lower}`;
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle id={id} className="text-lg">
            <Link href={`/certs/${lower}`} className="text-foreground">
              {code}
            </Link>{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{p.cert.name}</span>
          </CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <StatusChip status={p.view.status} />
            {p.focus ? <span className="font-semibold text-primary">Focus</span> : null}
            {p.view.bookedFor ? <span>Exam on {formatLong(p.view.bookedFor)}</span> : null}
            <span>{p.cert.examStyle === "performance" ? "Hands-on exam" : "Multiple-choice exam"}</span>
          </p>
        </div>
        {p.bookReady ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
            <CheckCircle2 aria-hidden="true" className="size-4" /> Ready to book
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          <ReadinessRing readiness={p.readiness} size={104} />
          {scored.length > 0 ? (
            <p className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <Sparkline values={trend} />
              <span>
                Last 8 weeks
                {change !== null ? `: ${change > 0 ? "up" : change < 0 ? "down" : "no change"}${change !== 0 ? ` ${Math.abs(change)} points` : ""}` : ""}
              </span>
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-2" aria-label={`What ${code} readiness is built from`}>
          <Source
            label="Questions"
            href={`/practice?cert=${code}`}
            value={p.questions.answered === 0 ? "None yet" : `${pct(p.questions.right / p.questions.answered)}% right`}
            detail={`${plural(p.questions.answered, "answer")}, ${p.questions.available} in the bank`}
          />
          <Source
            label="Lessons"
            href={`/certs/${lower}`}
            value={p.lessons.total === 0 ? "None yet" : `${p.lessons.done} of ${p.lessons.total}`}
            detail={p.lessons.total === 0 ? "No lessons for this cert yet" : "lessons finished"}
          />
          <Source
            label="Labs"
            href="/labs"
            value={p.labs.total === 0 ? "None yet" : `${p.labs.solved} of ${p.labs.total} solved`}
            detail={p.labs.total === 0 ? "No labs for this cert yet" : p.labs.tried === 0 ? "None tried yet" : p.labs.tried > p.labs.solved ? `${plural(p.labs.tried, "lab")} tried` : "every check green"}
          />
          <Source
            label="Mock exam"
            href="/mocks"
            value={p.mocks.available === 0 ? "None yet" : p.mocks.best === null ? "Not taken" : `Best ${p.mocks.best}%`}
            detail={
              p.mocks.available === 0
                ? "No mock exam for this cert yet"
                : p.mocks.latest === null
                  ? `Pass mark ${p.mocks.passMark ?? 66}%`
                  : `Latest ${p.mocks.latest}% · pass ${p.mocks.passMark}% · ${plural(p.mocks.attempts, "attempt")}`
            }
          />
        </dl>
      </div>

      <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Before you book</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {p.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                {c.met ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span>
                  <span className="sr-only">{c.met ? "Done: " : "To do: "}</span>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Next</h3>
          <p className="text-sm text-muted-foreground">
            {p.reviewDue > 0
              ? `${plural(p.reviewDue, "missed question")} due for review.`
              : p.reviewQueued > 0
                ? `${plural(p.reviewQueued, "question")} in review, none due today.`
                : "Nothing to review for this cert."}{" "}
            {weakest ? `Weakest domain: ${weakest.name} at ${pct(weakest.mastery)}%.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {weakest ? (
              <Link href={`/practice?cert=${code}&domains=${weakest.key}`} className={buttonVariants({ size: "sm" })}>
                Practise {weakest.name}
              </Link>
            ) : (
              <Link href={`/practice?cert=${code}`} className={buttonVariants({ size: "sm" })}>
                Practise {code}
              </Link>
            )}
            <Link href={`/certs/${lower}/readiness`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Readiness by domain
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default async function ProgressPage() {
  const { user, profile } = await requireOnboarded("/progress");
  const today = learnerToday(profile);
  const catalog = await getCatalog();
  const [dash, streak] = await Promise.all([getDashboard(user.id, catalog, today, profile.focusCert), getStreak(user.id, profile.timeZone, today)]);
  const stats = [
    { label: "Study streak", value: plural(streak, "day") },
    { label: "Lessons finished", value: String(dash.totals.lessons) },
    { label: "Labs solved", value: String(dash.totals.labsSolved) },
    { label: "Mock exams taken", value: String(dash.totals.mockAttempts) },
    { label: "Due for review", value: String(dash.totals.reviewDue), href: "/review" },
  ];
  return (
    <>
      <PageHeader
        title="Progress"
        lead="How ready you are for each cert you are working on, and what that is built from: questions, lessons, labs and mock exams."
      />
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card px-4 py-3">
            <dt className="text-[13px] text-muted-foreground">{s.href ? <Link href={s.href}>{s.label}</Link> : s.label}</dt>
            <dd className="text-[22px] font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="working-on" className="flex flex-col gap-6">
        <h2 id="working-on" className="text-lg font-semibold">
          Working on
        </h2>
        {dash.active.length === 0 ? (
          <Card>
            <p className="text-[15px] text-muted-foreground">
              No cert in progress yet. Pick a focus cert or mark one as booked on your <Link href="/path">path</Link>, then practise to see
              your readiness here.
            </p>
          </Card>
        ) : (
          dash.active.map((p) => <CertCard key={p.cert.code} p={p} />)
        )}
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card aria-labelledby="held">
          <CardTitle id="held">Passed</CardTitle>
          {dash.passed.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted-foreground">No passed certs recorded yet.</p>
          ) : (
            <ul className="mt-2 divide-y text-sm">
              {dash.passed.map(({ cert, view }) => (
                <li key={cert.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/certs/${cert.code.toLowerCase()}`} className="font-semibold">
                    {cert.code}
                  </Link>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {view.expiresOn ? <span>{view.status === "expired" ? "Expired" : "Valid until"} {formatLong(view.expiresOn)}</span> : null}
                    <StatusChip status={view.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="ahead">
          <CardTitle id="ahead">Still ahead</CardTitle>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {dash.notStarted === 0
              ? "Every cert is passed or in progress."
              : `${plural(dash.notStarted, "cert")} not started yet.`}{" "}
            <Link href="/path">See your path</Link>
          </p>
        </Card>
      </div>
    </>
  );
}
