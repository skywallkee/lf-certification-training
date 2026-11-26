import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import { START_WINDOW_MINUTES, docsViewerUrl, isActive, parseDocsHosts } from "@lfct/labs";
import { MockPlayer } from "@/components/mocks/mock-player";
import { Markdown } from "@/components/markdown";
import { env } from "@/env";
import { getLab, getSession } from "@/server/labs";
import { getLastChecksPerTask } from "@/server/mocks";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mock exam" };

export default async function MockAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/mocks/attempts/${id}`);
  const session = await getSession(id, user.id);
  if (!session) notFound();
  if (session.mode === "lab") redirect(`/labs/sessions/${id}`);
  if (!isActive(session.status) && session.status !== "failed") redirect(`/mocks/results/${id}`);
  const lab = await getLab(session.labId);
  if (!lab) notFound();
  const started = session.startedAt !== null;

  // Only what the learner may see. Task statements appear after Start; checks and the solution stay here.
  const tasks = lab.tasks.map((t) => ({
    id: t.id,
    title: started ? t.title : "",
    weight: t.weight,
    hintsTotal: 0,
    hints: [],
    cluster: t.cluster ?? lab.clusters[0] ?? "k8s",
    checks: t.checks.map((c) => ({ id: c.id })),
  }));
  const bodies = started ? Object.fromEntries(lab.tasks.map((t) => [t.id, <Markdown key={t.id}>{t.body}</Markdown>])) : {};
  const hosts = parseDocsHosts(env.labs.docsHosts);
  const docLinks = [{ title: "Kubernetes documentation (home)", url: "https://kubernetes.io/docs/home/" }, ...lab.docs];
  const docs = docLinks
    .filter((l, i) => docLinks.findIndex((x) => x.url === l.url) === i)
    .map((l) => ({ title: l.title, url: l.url, viewerUrl: docsViewerUrl(l.url, env.labs.docsUrl, hosts) }));
  // Practice mode: the latest result per task from its own Check runs.
  const last = session.mode === "practice" && started ? await getLastChecksPerTask(id) : [];

  return (
    <MockPlayer
      sessionId={session.id}
      title={lab.title}
      certCode={lab.certCode}
      mock={lab.mock}
      mode={session.mode}
      minutes={session.minutes}
      clusters={lab.clusters}
      tasks={tasks}
      bodies={bodies}
      docs={docs}
      startWindowMinutes={START_WINDOW_MINUTES}
      initial={{
        status: session.status,
        bootStep: session.bootStep,
        statusMessage: session.statusMessage,
        expiresAt: session.expiresAt?.toISOString() ?? null,
        startedAt: session.startedAt?.toISOString() ?? null,
        now: new Date().toISOString(),
        createdAt: session.createdAt.toISOString(),
      }}
      lastResults={last}
    />
  );
}

