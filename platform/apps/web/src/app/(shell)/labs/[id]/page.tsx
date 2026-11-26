import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QuotaMeter } from "@/components/labs/quota-meter";
import { StartLab, blockMessage } from "@/components/labs/start-lab";
import { Markdown } from "@/components/markdown";
import { DraftBadge, SampleBadge } from "@/components/status-chip";
import { Card, CardTitle } from "@/components/ui/card";
import { competencyPath, getCatalog } from "@/server/catalog";
import { blockFor, canOpen, getCapacity, getLab, getUsage } from "@/server/labs";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lab = await getLab((await params).id);
  return { title: lab ? lab.title : "Lab" };
}

export default async function LabPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ blocked?: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/labs/${id}`);
  const lab = await getLab(id);
  if (!lab || !canOpen(lab, user)) notFound();
  if (lab.kind === "mock") redirect(`/mocks/${lab.id}`);
  const [usage, capacity, catalog] = await Promise.all([getUsage(user.id), getCapacity(), getCatalog()]);
  const block = blockFor(lab, usage, capacity);
  const { blocked } = await searchParams;

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/labs">Labs</Link> / <span aria-current="page">{lab.certCode}</span>
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">{lab.title}</h1>
          {lab.mock ? <SampleBadge /> : null}
          {lab.published ? null : <DraftBadge />}
        </div>
        <p className="max-w-[72ch] text-[15px] text-muted-foreground">{lab.summary}</p>
        <p className="text-sm">
          {lab.certCode} · Tier {lab.tier} · {lab.minutes} minutes · {lab.clusters.length > 1 ? `${lab.clusters.length} clusters · ` : ""}scored per
          check, task by task
        </p>
      </header>
      {blocked && block ? (
        <p role="alert" className="max-w-[72ch] rounded-md bg-warning-soft px-4 py-3 text-[15px]">
          {blockMessage(block, usage, lab.minutes)}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card aria-labelledby="tasks">
          <CardTitle id="tasks">Tasks</CardTitle>
          <ol className="mt-3 flex flex-col gap-4">
            {lab.tasks.map((t, i) => (
              <li key={t.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <h3 className="font-semibold">
                  {i + 1}. {t.title} <span className="font-normal text-muted-foreground">· {t.weight}%</span>
                </h3>
                <Markdown className="mt-1 text-[15px]">{t.body}</Markdown>
              </li>
            ))}
          </ol>
        </Card>
        <div className="flex flex-col gap-4">
          <Card aria-labelledby="start">
            <CardTitle id="start">Run it</CardTitle>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              You get {lab.clusters.length > 1 ? `${lab.clusters.length} fresh single-node clusters (${lab.clusters.join(", ")}), one kubectl context each,` : "a fresh single-node cluster,"}{" "}
              a terminal with kubectl, the official docs, and {lab.minutes} minutes. Check your work as often as you like.
            </p>
            <StartLab lab={lab} usage={usage} block={block} />
          </Card>
          <QuotaMeter usage={usage} capacity={capacity} />
          <Card aria-labelledby="covers">
            <CardTitle id="covers">Competencies</CardTitle>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {lab.competencyRefs.map((ref) => {
                const c = catalog.competencies.get(ref);
                return (
                  <li key={ref}>
                    <Link href={competencyPath(ref)}>
                      {c ? `${c.cert.code}: ${c.competency.statement}` : ref}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {lab.docs.length > 0 ? (
              <>
                <h3 className="mt-4 text-sm font-semibold">Docs you may use</h3>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {lab.docs.map((d) => (
                    <li key={d.url}>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </article>
  );
}
