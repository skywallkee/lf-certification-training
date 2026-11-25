import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SampleBadge } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { search } from "@/server/search";

export const metadata: Metadata = { title: "Search" };

const KIND = { lesson: "Lesson", competency: "Competency", question: "Question" } as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.slice(0, 200);
  const results = query ? await search(query) : [];
  return (
    <>
      <PageHeader title="Search" lead="Find lessons, official competencies and questions across all 17 certs." />
      <form role="search" action="/search" className="mb-6 flex max-w-xl flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Search for</Label>
          <Input id="q" name="q" type="search" defaultValue={query} placeholder="For example: storage class, CoreDNS, RBAC" />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {query ? (
        <section aria-labelledby="results">
          <h2 id="results" className="mb-3 text-sm font-semibold text-muted-foreground" aria-live="polite">
            {results.length === 0 ? `No results for "${query}". Try a shorter or different word.` : `${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`}
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {results.map((r) => (
              <li key={`${r.kind}-${r.href}-${r.title}`} className="flex flex-col gap-1 px-5 py-3">
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {KIND[r.kind]} {r.mock ? <SampleBadge className="normal-case tracking-normal" /> : null}
                </span>
                <Link href={r.href} className="font-medium">
                  {r.title}
                </Link>
                <span className="text-sm text-muted-foreground">{r.context}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
