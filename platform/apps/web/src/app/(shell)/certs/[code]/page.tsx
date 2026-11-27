import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight, FlaskConical, ListChecks, Timer } from "lucide-react";
import { CoverageBadge } from "@/components/coverage-badge";
import { weakestDomain } from "@/components/domain-weight-bar";
import { ExamStatusForm } from "@/components/forms/exam-status-form";
import { setFocusAction } from "@/app/actions/study";
import { SampleBadge, StatusChip } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatLong } from "@/lib/dates";
import { pct, evidenceSummary } from "@/lib/readiness";
import { VALIDITY_SOURCE, validityMonths } from "@/lib/validity";
import { en } from "@/messages/en";
import { certRefs, competencyPath, coverageOf, lessonsFor } from "@/server/catalog";
import { loadCert } from "@/server/cert-page";
import { getReadiness, getReported, getStatusViews } from "@/server/progress";
import { listLabs } from "@/server/labs";
import { listMocks } from "@/server/mocks";
import { listQuizMocks } from "@/server/quiz-mocks";
import { getProfile, getUser } from "@/server/session";
import { learnerToday } from "@/server/today";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: code.toUpperCase() };
}

export default async function CertHomePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { catalog, cert } = await loadCert(code);
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  const today = learnerToday(profile);
  const readiness = user ? await getReadiness(user.id, cert, today) : null;
  const view = user ? (await getStatusViews(user.id, catalog, today, profile?.focusCert ?? null)).get(cert.code) : undefined;
  const reported = user ? (await getReported(user.id)).get(cert.code) : undefined;
  const refs = certRefs(cert);
  const coverage = coverageOf(catalog, refs);
  const certLessons = catalog.lessons.filter((l) => l.competencyRefs.some((r) => refs.includes(r)));
  const anySample = certLessons.some((l) => l.mock) || (catalog.questionCountByCert.get(cert.code) ?? 0) > 0;
  const weakest = readiness?.sufficient ? weakestDomain(readiness.domains) : undefined;
  const lower = cert.code.toLowerCase();
  // Lessons in the official domain order, each linking to its competency page where it is shown.
  const domainOrder = new Map(cert.domains.map((d, i) => [d.key, i]));
  const lessonList = certLessons
    .map((l) => ({ lesson: l, ref: l.competencyRefs.find((r) => refs.includes(r))! }))
    .map((x) => ({ ...x, domain: catalog.competencies.get(x.ref)?.domain }))
    .sort((a, b) => (domainOrder.get(a.domain?.key ?? "") ?? 99) - (domainOrder.get(b.domain?.key ?? "") ?? 99));
  const [labCount, mockCount] = user
    ? await Promise.all([
        listLabs().then((ls) => ls.filter((l) => l.certCode === cert.code).length),
        Promise.all([listMocks(), listQuizMocks()]).then(([a, b]) => [...a, ...b].filter((m) => m.certCode === cert.code).length),
      ])
    : [0, 0];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
        <Link href="/certs">Certifications</Link> / <span aria-current="page">{cert.code}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] font-bold">{cert.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {view ? <StatusChip status={view.status} /> : null}
            {view?.status === "booked" && view.bookedFor ? (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 font-semibold text-primary">Exam {formatLong(view.bookedFor)}</span>
            ) : null}
            <span className="rounded-full bg-muted px-2.5 py-0.5">
              {cert.examStyle === "performance" ? "Performance-based" : "Multiple choice"}
              {cert.durationMinutes ? ` · ${cert.durationMinutes} min` : ""}
            </span>
            {cert.version ? <span className="rounded-full bg-muted px-2.5 py-0.5">Curriculum v{cert.version}</span> : null}
            {cert.requiredFrom && cert.requiredFrom > today ? (
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 font-semibold text-warning">
                Required for Golden Kubestronaut from {formatLong(cert.requiredFrom)}
              </span>
            ) : null}
            {anySample ? <SampleBadge /> : null}
          </div>
        </div>
        {user ? (
          weakest ? (
            <Link href={`/practice?cert=${cert.code}&domains=${weakest.key}`} className={cn(buttonVariants(), "h-auto max-w-full whitespace-normal py-2 text-left")}>
              Practise your weakest domain: {weakest.name}
            </Link>
          ) : (
            <Link href={`/practice?cert=${cert.code}`} className={buttonVariants()}>
              Practise {cert.code}
            </Link>
          )
        ) : (
          <Link href={`/sign-in?next=/certs/${lower}`} className={buttonVariants()}>
            Sign in to practise
          </Link>
        )}
      </header>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card aria-labelledby="lessons-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle id="lessons-title">Lessons</CardTitle>
            <span className="text-[13px] text-muted-foreground">
              {lessonList.length} lesson{lessonList.length === 1 ? "" : "s"} · {coverage.withLessons} of {coverage.competencies} topics covered
            </span>
          </div>
          {lessonList.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No lessons for {cert.code} yet. The domains below list every topic the exam covers.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {lessonList.map(({ lesson, ref, domain }) => (
                <li key={lesson.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <BookOpen aria-hidden="true" className="size-4 shrink-0 translate-y-0.5 text-primary" />
                    <Link href={`${competencyPath(ref)}#lesson-${lesson.id}`} className="font-medium">
                      {lesson.title}
                    </Link>
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {domain ? `${domain.name} · ` : ""}
                    {lesson.minutes} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="practise-title" className="flex flex-col gap-3">
          <CardTitle id="practise-title">Practise {cert.code}</CardTitle>
          <ul className="flex flex-col gap-1">
            {[
              { href: user ? `/practice?cert=${cert.code}` : `/sign-in?next=/certs/${lower}`, Icon: ListChecks, label: "Practice quiz", hint: "Short quiz across every domain" },
              ...(labCount > 0 ? [{ href: `/labs#cert-${cert.code}`, Icon: FlaskConical, label: `Labs (${labCount})`, hint: "Hands-on tasks on a real cluster" }] : []),
              ...(mockCount > 0 ? [{ href: `/mocks#cert-${cert.code}`, Icon: Timer, label: `Mock exams (${mockCount})`, hint: "Timed, like the real exam" }] : []),
            ].map(({ href, Icon, label, hint }) => (
              <li key={label}>
                <Link href={href} className="flex items-center gap-3 rounded-md px-2 py-2 text-foreground no-underline hover:bg-muted hover:text-foreground">
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-[13px] text-muted-foreground">{hint}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          {user ? (
            <p className="mt-auto text-[13px] text-muted-foreground">
              Booked the exam? <Link href="#status">Set your exam date</Link> so your plan and expiry dates follow it.
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {readiness ? (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[13px] text-muted-foreground">Readiness</p>
            {readiness.sufficient ? (
              <>
                <p className="mt-1 text-[26px] font-bold">{pct(readiness.score)}%</p>
                <p className="text-[13px] text-muted-foreground">
                  {pct(readiness.low)} to {pct(readiness.high)}%, {evidenceSummary(readiness.bySource)} ·{" "}
                  <Link href={`/certs/${lower}/readiness`}>Details</Link>
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {en.readiness.little(readiness.answersNeeded || 1, readiness.domainsNeeded)}
              </p>
            )}
          </div>
        ) : null}
        {view?.status === "booked" && view.daysLeft !== undefined ? (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[13px] text-muted-foreground">Days to exam</p>
            <p className="mt-1 text-[26px] font-bold">{view.daysLeft}</p>
            <p className="text-[13px] text-muted-foreground">
              {profile?.hoursPerWeek ? `About ${profile.hoursPerWeek} hours a week planned` : "Set your hours a week in onboarding"}
            </p>
          </div>
        ) : null}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Content coverage</p>
          <p className="mt-1 text-[26px] font-bold">
            {coverage.withLessons} of {coverage.competencies}
          </p>
          <p className="text-[13px] text-muted-foreground">
            competencies have lessons; {coverage.withQuestions} have questions
          </p>
        </div>
      </div>

      <Card className="overflow-hidden p-0" aria-labelledby="domains">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <CardTitle id="domains">Domains, by official weight</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Open a domain to see every topic the exam covers.</p>
          </div>
          <CoverageBadge coverage={coverage} />
        </div>
        <ul>
          {cert.domains.map((d) => {
            const dm = readiness?.domains.find((x) => x.key === d.key);
            const domainRefs = d.competencies.map((c) => c.ref);
            const domainLessons = new Set(domainRefs.flatMap((r) => lessonsFor(catalog, r).map((l) => l.id)));
            const questions = domainRefs.reduce((n, r) => n + (catalog.questionsByCompetency.get(r) ?? 0), 0);
            const isWeak = weakest?.key === d.key;
            return (
              <li key={d.key} className={`border-b last:border-b-0 ${isWeak ? "bg-warning-soft" : ""}`}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_64px_minmax(120px,30%)_minmax(0,200px)] [&::-webkit-details-marker]:hidden">
                    <span className={`flex items-center gap-2 ${isWeak ? "font-semibold" : "font-medium"}`}>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                      {d.name}
                    </span>
                    <span className="text-sm">{d.weight}%</span>
                    <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      {dm && dm.answers > 0 ? (
                        <>
                          <Progress value={pct(dm.mastery)} tone={isWeak ? "warning" : "primary"} label={`${d.name} mastery`} />
                          <span className={`w-10 text-sm ${isWeak ? "font-semibold text-warning" : ""}`}>{pct(dm.mastery)}%</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{user ? "No answers yet" : `${d.competencies.length} competencies`}</span>
                      )}
                    </span>
                    <span className="col-span-2 text-sm text-muted-foreground sm:col-span-1">
                      {domainLessons.size} lesson{domainLessons.size === 1 ? "" : "s"} · {questions} question{questions === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <ul className="flex flex-col gap-2 px-5 pb-4 pl-8 text-sm">
                    {d.competencies.length === 0 ? (
                      <li className="text-muted-foreground">Competencies for this domain are still being transcribed from the source.</li>
                    ) : null}
                    {d.competencies.map((c) => {
                      const lessons = lessonsFor(catalog, c.ref);
                      const q = catalog.questionsByCompetency.get(c.ref) ?? 0;
                      return (
                        <li key={c.ref} className="flex flex-wrap justify-between gap-2">
                          <Link href={competencyPath(c.ref)}>{c.statement}</Link>
                          <span className="text-muted-foreground">
                            {lessons.length > 0 ? "Lesson" : en.coverage.coming} · {q} question{q === 1 ? "" : "s"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="mt-3 text-[13px] text-muted-foreground">
        Domains and competencies are transcribed from the public curriculum{cert.version ? ` for ${cert.code} v${cert.version}` : ""}
        {cert.verification === "pending" ? " and are still pending verification against the source" : ""}.{" "}
        <a href={cert.sourceUrl} target="_blank" rel="noreferrer">
          See the source
        </a>
      </p>

      {user ? (
        <Card id="status" aria-labelledby="status-title" className="mt-6">
          <CardTitle id="status-title">Your {cert.code} exam</CardTitle>
          <p className="mb-4 mt-1 text-[15px] text-muted-foreground">
            {view?.status === "passed" || view?.status === "expiring" || view?.status === "expired"
              ? `Passed ${formatLong(view.passedOn!)}. ${view.status === "expired" ? "Expired" : "Expires"} ${formatLong(view.expiresOn!)}.`
              : "Tell us when your exam is booked or passed. Expiry dates are worked out for you."}{" "}
            {cert.code} stays current for {validityMonths(cert.code)} months after you pass{" "}
            <a href={VALIDITY_SOURCE.url} target="_blank" rel="noreferrer">
              (Linux Foundation policy)
            </a>
            .
          </p>
          <ExamStatusForm cert={cert.code} state={reported?.state ?? null} date={reported?.bookedFor ?? reported?.passedOn ?? null} today={today} />
          <div className="mt-5 border-t pt-4 text-[15px]">
            {profile?.focusCert === cert.code ? (
              <p className="text-muted-foreground">
                {cert.code} is your focus cert: Today and your study plan follow it.
              </p>
            ) : (
              <form action={setFocusAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="cert" value={cert.code} />
                <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Make {cert.code} my focus
                </button>
                <span className="text-[13px] text-muted-foreground">Today and your study plan follow your focus cert.</span>
              </form>
            )}
          </div>
        </Card>
      ) : null}
    </>
  );
}
