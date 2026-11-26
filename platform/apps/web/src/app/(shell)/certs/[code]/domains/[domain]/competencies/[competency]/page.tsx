import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { videoSeconds } from "@lfct/curriculum";
import { lesson as lessonTable } from "@lfct/curriculum/db";
import { completeLessonAction, startQuizAction } from "@/app/actions/study";
import { BookmarkButton, FlagButton, NoteEditor } from "@/components/item-tools";
import { LessonBody } from "@/components/lesson-body";
import { LessonVideo } from "@/components/lesson-video";
import { SampleBadge } from "@/components/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { en } from "@/messages/en";
import { competencyPath, lessonsFor } from "@/server/catalog";
import { loadCert } from "@/server/cert-page";
import { getItemState } from "@/server/items";
import { getCompletedLessons } from "@/server/progress";
import { labsForCompetency } from "@/server/labs";
import { playerScenes } from "@/server/narration";
import { getUser } from "@/server/session";

type Params = { code: string; domain: string; competency: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { code, domain, competency } = await params;
  const { catalog } = await loadCert(code);
  const entry = catalog.competencies.get(`${code}/${domain}/${competency}`);
  return { title: entry ? `${entry.competency.statement} · ${code.toUpperCase()}` : "Competency" };
}

export default async function CompetencyPage({ params }: { params: Promise<Params> }) {
  const { code, domain: domainKey, competency: compKey } = await params;
  const { catalog, cert } = await loadCert(code);
  const ref = `${code}/${domainKey}/${compKey}`;
  const entry = catalog.competencies.get(ref);
  if (!entry) notFound();
  const { domain, competency } = entry;
  const user = await getUser();
  const lessonMeta = lessonsFor(catalog, ref);
  const lessons = lessonMeta.length
    ? await getDb().select().from(lessonTable).where(inArray(lessonTable.id, lessonMeta.map((l) => l.id)))
    : [];
  const questions = catalog.questionsByCompetency.get(ref) ?? 0;
  const labs = await labsForCompetency(ref);
  const completed = user ? await getCompletedLessons(user.id) : new Set<string>();
  const state = user ? await getItemState(user.id, "lesson", lessons.map((l) => l.id)) : null;
  const back = competencyPath(ref);
  // Other certs' competencies that share a lesson with this one ("You covered this for CKA").
  const shared = [...new Set(lessons.flatMap((l) => l.competencyRefs).filter((r) => r !== ref))]
    .map((r) => catalog.competencies.get(r))
    .filter((x) => x !== undefined);

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
        <Link href="/certs">Certs</Link> / <Link href={`/certs/${code}`}>{cert.code}</Link> /{" "}
        <Link href={`/certs/${code}/domains/${domainKey}`}>{domain.name}</Link> / <span aria-current="page">Competency</span>
      </nav>
      <header className="mb-6 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Official competency, {cert.code} · {domain.name} ({domain.weight}%)
        </p>
        {lessons.length === 0 ? (
          <h1 className="border-l-4 border-primary pl-4 text-[26px] font-bold leading-snug">{competency.statement}</h1>
        ) : (
          <blockquote className="border-l-4 border-primary pl-4 text-[20px] font-semibold leading-snug">{competency.statement}</blockquote>
        )}
      </header>

      {lessons.length === 0 ? (
        <Card aria-labelledby="coming" className="mb-6">
          <CardTitle id="coming">{en.coverage.coming}</CardTitle>
          <p className="mt-2 max-w-[72ch] text-[15px] text-muted-foreground">
            No lesson covers this competency yet. Read the official curriculum and the project docs meanwhile
            {questions > 0 ? ", and practise the questions below" : ""}.
          </p>
          <p className="mt-3 text-sm">
            <a href={cert.sourceUrl} target="_blank" rel="noreferrer">
              {cert.code} curriculum (source)
            </a>
          </p>
        </Card>
      ) : null}

      {lessons.map((l) => {
        const done = completed.has(l.id);
        return (
          <section key={l.id} aria-labelledby={`lesson-${l.id}`} className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h1 id={`lesson-${l.id}`} className="text-[30px] font-bold">
                {l.title}
              </h1>
              {l.mock ? <SampleBadge /> : null}
            </div>
            <p className="mb-6 max-w-[72ch] text-[15px] text-muted-foreground">
              {l.summary} · {l.minutes} min read{l.video ? ` · ${Math.max(1, Math.round(videoSeconds(l.video) / 60))} min video` : ""}
            </p>
            {shared.length > 0 ? (
              <p className="mb-6 rounded-md bg-primary-soft px-4 py-2 text-sm">
                This lesson also covers{" "}
                {shared.map((s, i) => (
                  <span key={s.competency.ref}>
                    {i > 0 ? ", " : ""}
                    <Link href={competencyPath(s.competency.ref)}>
                      {s.cert.code}: {s.competency.statement}
                    </Link>
                  </span>
                ))}
                .
              </p>
            ) : null}
            {l.video ? <LessonVideo title={l.title} scenes={playerScenes(l.id, l.video, l.diagrams)} /> : null}
            <LessonBody hash={l.contentHash} source={l.body} untrusted={l.origin === "app"} diagrams={l.diagrams} />
            {l.docs.length > 0 ? (
              <section aria-labelledby={`docs-${l.id}`} className="mt-8 max-w-[72ch]">
                <h2 id={`docs-${l.id}`} className="mb-2 text-lg font-semibold">
                  Official docs
                </h2>
                <ul className="flex list-disc flex-col gap-1 pl-6">
                  {l.docs.map((d) => (
                    <li key={d.url}>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {user ? (
              <div className="mt-8 flex max-w-[72ch] flex-col gap-4 rounded-lg border bg-card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <form action={completeLessonAction}>
                    <input type="hidden" name="lesson" value={l.id} />
                    <input type="hidden" name="back" value={back} />
                    {done ? <input type="hidden" name="undo" value="1" /> : null}
                    <Button type="submit" variant={done ? "outline" : "default"}>
                      {done ? "Done · mark as not done" : "Mark as done"}
                    </Button>
                  </form>
                  <BookmarkButton targetType="lesson" targetId={l.id} saved={state!.saved.has(l.id)} back={back} />
                  <FlagButton targetType="lesson" targetId={l.id} />
                </div>
                <NoteEditor targetType="lesson" targetId={l.id} body={state!.notes.get(l.id) ?? ""} />
              </div>
            ) : null}
          </section>
        );
      })}

      <Card aria-labelledby="practise" className="max-w-[72ch]">
        <CardTitle id="practise">Practise this competency</CardTitle>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {questions === 0
            ? "No questions for this competency yet. Practise the whole domain instead."
            : `${questions} question${questions === 1 ? "" : "s"} tagged with this competency.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {user ? (
            questions > 0 ? (
              <form action={startQuizAction}>
                <input type="hidden" name="cert" value={cert.code} />
                <input type="hidden" name="competency" value={ref} />
                <input type="hidden" name="count" value={Math.min(5, questions)} />
                <input type="hidden" name="feedback" value="instant" />
                <Button type="submit">Practise {Math.min(5, questions)} questions</Button>
              </form>
            ) : (
              <Link href={`/practice?cert=${cert.code}&domains=${domainKey}`} className={buttonVariants()}>
                Practise {domain.name}
              </Link>
            )
          ) : (
            <Link href={`/sign-in?next=${encodeURIComponent(back)}`} className={buttonVariants()}>
              Sign in to practise
            </Link>
          )}
        </div>
      </Card>

      {labs.length > 0 ? (
        <Card aria-labelledby="labs" className="mt-6 max-w-[72ch]">
          <CardTitle id="labs">Hands-on labs</CardTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {labs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                <Link href={user ? `/labs/${l.id}` : `/sign-in?next=${encodeURIComponent(`/labs/${l.id}`)}`}>{l.title}</Link>
                <span className="text-sm text-muted-foreground">
                  · Tier {l.tier} · {l.minutes} min
                </span>
                {l.mock ? <SampleBadge /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </article>
  );
}
