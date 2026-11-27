import { notFound } from "next/navigation";
import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import { buttonVariants } from "@/components/ui/button";
import { en } from "@/messages/en";
import { competencyPath, coverageOf, lessonsFor } from "@/server/catalog";
import { loadCert } from "@/server/cert-page";
import { getUser } from "@/server/session";

export default async function DomainPage({ params }: { params: Promise<{ code: string; domain: string }> }) {
  const { code, domain: key } = await params;
  const { catalog, cert } = await loadCert(code);
  const domain = cert.domains.find((d) => d.key === key);
  if (!domain) notFound();
  const user = await getUser();
  const refs = domain.competencies.map((c) => c.ref);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
        <Link href="/certs">Certifications</Link> / <Link href={`/certs/${code}`}>{cert.code}</Link> / <span aria-current="page">{domain.name}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold">{domain.name}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {domain.weight}% of the {cert.code} exam · <CoverageBadge coverage={coverageOf(catalog, refs)} />
          </p>
        </div>
        <Link href={user ? `/practice?cert=${cert.code}&domains=${domain.key}` : `/sign-in?next=/certs/${code}/domains/${key}`} className={buttonVariants()}>
          {user ? "Practise this domain" : "Sign in to practise"}
        </Link>
      </header>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {domain.competencies.map((c) => {
          const lessons = lessonsFor(catalog, c.ref);
          const q = catalog.questionsByCompetency.get(c.ref) ?? 0;
          return (
            <li key={c.ref} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <Link href={competencyPath(c.ref)}>{c.statement}</Link>
              <span className="text-sm text-muted-foreground">
                {lessons.length > 0 ? `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}` : en.coverage.coming} · {q} question{q === 1 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
