import type { Metadata } from "next";
import { PracticeForm, type PracticeCert } from "@/components/forms/practice-form";
import { PageHeader } from "@/components/page-header";
import { SampleBadge } from "@/components/status-chip";
import { en } from "@/messages/en";
import { getCatalog } from "@/server/catalog";
import { requireOnboarded } from "@/server/session";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ cert?: string; domains?: string | string[]; empty?: string }> }) {
  const { profile } = await requireOnboarded("/practice");
  const sp = await searchParams;
  const catalog = await getCatalog();
  const certs: PracticeCert[] = [...catalog.certs.values()]
    .map((c) => ({
      code: c.code,
      name: c.name,
      questions: catalog.questionCountByCert.get(c.code) ?? 0,
      domains: c.domains.map((d) => ({
        key: d.key,
        name: d.name,
        weight: d.weight,
        questions: d.competencies.reduce((n, comp) => n + (catalog.questionsByCompetency.get(comp.ref) ?? 0), 0),
      })),
    }))
    .sort((a, b) => b.questions - a.questions || a.code.localeCompare(b.code));
  const requested = sp.cert?.toUpperCase();
  const initialCert = certs.find((c) => c.code === requested)?.code ?? certs.find((c) => c.code === profile.focusCert)?.code ?? certs[0]!.code;
  const initialDomains = [sp.domains ?? []].flat();
  return (
    <>
      <PageHeader
        title="Practice quiz"
        lead={
          <span className="inline-flex flex-wrap items-center gap-2">
            Pick a cert, the domains and how many questions. <SampleBadge />
          </span>
        }
      />
      {sp.empty ? (
        <p role="alert" className="mb-4 rounded-md border border-warning bg-warning-soft px-4 py-2 text-sm">
          {en.quiz.noQuestions}
        </p>
      ) : null}
      <div className="rounded-lg border bg-card p-6">
        <PracticeForm certs={certs} initialCert={initialCert} initialDomains={initialDomains} />
      </div>
    </>
  );
}
