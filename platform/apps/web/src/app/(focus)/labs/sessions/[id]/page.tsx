import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { EXTEND_MINUTES, docsViewerUrl, isActive, parseDocsHosts } from "@lfct/labs";
import { LabPlayer } from "@/components/labs/lab-player";
import { Markdown } from "@/components/markdown";
import { env } from "@/env";
import { getHintUses, getLab, getLastCheck, getSession } from "@/server/labs";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Lab" };

export default async function LabSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/labs/sessions/${id}`);
  const session = await getSession(id, user.id);
  if (!session) notFound();
  if (!isActive(session.status) && session.status !== "failed") redirect(`/labs/history/${id}`);
  const [lab, hintUses, last] = await Promise.all([getLab(session.labId), getHintUses(id), getLastCheck(id, "check")]);
  if (!lab) notFound();

  // Only what the learner may see: task text, weights, hints already opened. Checks and the solution stay here.
  const tasks = lab.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    weight: t.weight,
    hintsTotal: t.hints.length,
    hints: hintUses
      .filter((h) => h.taskId === t.id)
      .sort((a, b) => a.hintIndex - b.hintIndex)
      .map((h) => t.hints[h.hintIndex] ?? ""),
    cluster: t.cluster ?? lab.clusters[0] ?? "k8s",
    checks: t.checks.map((c) => ({ id: c.id })),
  }));
  // The lab's own links first, then the documentation home; each through the docs viewer when allowlisted.
  const hosts = parseDocsHosts(env.labs.docsHosts);
  const docLinks = [...lab.docs, { title: "Kubernetes documentation (home)", url: "https://kubernetes.io/docs/home/" }];
  const docs = docLinks
    .filter((l, i) => docLinks.findIndex((x) => x.url === l.url) === i)
    .map((l) => ({ title: l.title, url: l.url, viewerUrl: docsViewerUrl(l.url, env.labs.docsUrl, hosts) }));
  const bodies = Object.fromEntries(lab.tasks.map((t) => [t.id, <Markdown key={t.id}>{t.body}</Markdown>]));

  return (
    <LabPlayer
      sessionId={session.id}
      title={lab.title}
      certCode={lab.certCode}
      mock={lab.mock}
      tasks={tasks}
      bodies={bodies}
      extendMinutes={EXTEND_MINUTES}
      multiCluster={lab.clusters.length > 1}
      docs={docs}
      initial={{
        status: session.status,
        bootStep: session.bootStep,
        statusMessage: session.statusMessage,
        expiresAt: session.expiresAt?.toISOString() ?? null,
        extended: session.extended,
        now: new Date().toISOString(),
        createdAt: session.createdAt.toISOString(),
      }}
      lastCheck={
        last ? { results: last.results.map(({ detail: _d, ...r }) => r), score: last.score, at: last.createdAt.toISOString() } : null
      }
    />
  );
}
