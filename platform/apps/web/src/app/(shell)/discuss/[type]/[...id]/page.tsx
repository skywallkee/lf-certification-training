import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Discussion } from "@/components/discussions/discussion";
import { Markdown } from "@/components/markdown";
import { discussPath, isTargetId, isTargetType } from "@/lib/discussions";
import { describeTarget, getActiveExam, viewerHasDone } from "@/server/discussions";
import { requireUser } from "@/server/session";

type Params = { type: string; id: string[] };

function parse(p: Params) {
  const id = p.id.map((s) => decodeURIComponent(s)).join("/");
  return isTargetType(p.type) && isTargetId(p.type, id) ? { type: p.type, id } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  return { title: parse(await params) ? "Discussion" : "Not found" };
}

/**
 * A discussion on its own page: questions and mock exam tasks have no page of their own, and links in emails land
 * here. Shows what the discussion is about, then the discussion.
 */
export default async function DiscussPage({ params }: { params: Promise<Params> }) {
  const t = parse(await params);
  if (!t) notFound();
  const path = discussPath(t.type, t.id);
  const user = await requireUser(path);
  const exam = await getActiveExam(user.id);
  const info = await describeTarget(t.type, t.id, user);
  if (!info) notFound();
  // A mock task's text stays out of sight until the learner has taken the mock, so the mock stays fresh.
  const showContext = Boolean(info.context) && !exam && (t.type !== "mock-task" || (await viewerHasDone(t.type, t.id, user.id)));
  const kind = { lesson: "Lesson", question: "Question", lab: "Lab", "mock-task": "Mock exam task" }[t.type];
  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <span>Discussions</span> / <span aria-current="page">{kind}</span>
      </nav>
      <header className="flex max-w-[72ch] flex-col gap-3">
        <p className="text-sm text-muted-foreground">Discussion about a {kind.toLowerCase()}</p>
        <h1 className="text-[26px] font-bold leading-snug">{info.title}</h1>
        {/* The question or task text is withheld during an exam too: it could be the exam's own. */}
        {showContext ? (
          <div className="rounded-lg border bg-card p-5">
            <Markdown className="text-[15px]">{info.context!}</Markdown>
          </div>
        ) : null}
        {t.type === "lesson" || t.type === "lab" ? (
          <p className="text-sm">
            <Link href={info.href.replace(/#.*$/, "")}>Open the {kind.toLowerCase()}</Link>
          </p>
        ) : null}
        {t.type === "mock-task" && info.mockId ? (
          <p className="text-sm">
            <Link href={`/mocks/${info.mockId}`}>Open the mock exam</Link>
          </p>
        ) : null}
      </header>
      <Discussion targetType={t.type} targetId={t.id} viewer={user} back={path} />
    </article>
  );
}
