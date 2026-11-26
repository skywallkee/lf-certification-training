import type { Metadata } from "next";
import Link from "next/link";
import { Highlight } from "@/components/highlight";
import { PageHeader } from "@/components/page-header";
import { SampleBadge } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { isSearchKind, KIND_LABEL, KIND_PLURAL, SEARCH_KINDS, tokenize, type SearchKind } from "@/lib/search";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/server/catalog";
import { search } from "@/server/search";

export const metadata: Metadata = { title: "Search" };

const PAGE = 50;

function href(q: string, type: SearchKind | undefined, cert: string | undefined) {
  const p = new URLSearchParams({ q });
  if (type) p.set("type", type);
  if (cert) p.set("cert", cert);
  return `/search?${p.toString()}`;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; cert?: string }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 200).trim();
  const type = isSearchKind(params.type) ? params.type : undefined;
  const catalog = await getCatalog();
  const certs = [...catalog.certs.values()].sort((a, b) => a.code.localeCompare(b.code));
  const cert = certs.find((c) => c.code === params.cert?.toUpperCase())?.code;
  const all = query ? await search(query, { cert, limit: 400 }) : [];
  const counts = Object.fromEntries(SEARCH_KINDS.map((k) => [k, all.filter((r) => r.kind === k).length])) as Record<SearchKind, number>;
  const shown = (type ? all.filter((r) => r.kind === type) : all).slice(0, PAGE);
  const total = type ? counts[type] : all.length;
  const tokens = tokenize(query);
  const noun = (n: number) => (type ? (n === 1 ? KIND_LABEL[type] : KIND_PLURAL[type]).toLowerCase() : n === 1 ? "result" : "results");
  const where = cert ? ` in ${cert}` : "";

  return (
    <>
      <PageHeader title="Search" lead="Find certs, official competencies, lessons, questions, labs and mock exams across all 17 certs." />
      <form role="search" action="/search" className="mb-4 flex max-w-2xl flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-[2_1_14rem] flex-col gap-1.5">
          <Label htmlFor="q">Search for</Label>
          <Input id="q" name="q" type="search" defaultValue={query} placeholder="For example: storage class, CoreDNS, RBAC" />
        </div>
        <div className="flex min-w-0 flex-[1_1_8rem] flex-col gap-1.5">
          <Label htmlFor="cert">Cert</Label>
          <Select id="cert" name="cert" defaultValue={cert ?? ""}>
            <option value="">All certs</option>
            {certs.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
        </div>
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <Button type="submit">Search</Button>
      </form>
      {query ? (
        <>
          <nav aria-label="Filter by type" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {[undefined, ...SEARCH_KINDS].map((k) => {
                const n = k ? counts[k] : all.length;
                const active = k === type;
                if (k && n === 0 && !active) return null;
                return (
                  <li key={k ?? "all"}>
                    <Link
                      href={href(query, k, cert)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm no-underline",
                        active ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-card text-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {k ? KIND_PLURAL[k] : "All"}
                      <span className="text-muted-foreground">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <section aria-labelledby="results">
            <h2 id="results" className="mb-3 text-sm font-semibold text-muted-foreground" aria-live="polite">
              {total === 0
                ? `No ${noun(0)}${where} for "${query}". Try a shorter or different word${type || cert ? ", or clear the filters" : ""}.`
                : `${total} ${noun(total)}${where} for "${query}"${total > shown.length ? `, showing the best ${shown.length}` : ""}`}
            </h2>
            {total === 0 && (type || cert) ? (
              <Link href={href(query, undefined, undefined)} className="text-sm font-medium">
                Search everything for &quot;{query}&quot;
              </Link>
            ) : null}
            {shown.length > 0 ? (
              <ul className="flex flex-col divide-y rounded-lg border bg-card">
                {shown.map((r) => (
                  <li key={`${r.kind}-${r.href}-${r.title}`} className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:px-5">
                    <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[r.kind]} · {r.cert} {r.mock ? <SampleBadge className="normal-case tracking-normal" /> : null}
                    </span>
                    <Link href={r.href} className="break-words font-medium">
                      <Highlight text={r.title} tokens={tokens} />
                    </Link>
                    {r.snippet ? (
                      <span className="break-words text-sm text-foreground">
                        <Highlight text={r.snippet} tokens={tokens} />
                      </span>
                    ) : null}
                    <span className="break-words text-sm text-muted-foreground">{r.context}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : (
        <p className="text-[15px] text-muted-foreground">
          Tip: press <kbd className="rounded border bg-card px-1.5 font-mono text-xs">/</kbd> or{" "}
          <kbd className="rounded border bg-card px-1.5 font-mono text-xs">Ctrl K</kbd> on any page to search without leaving it.
        </p>
      )}
    </>
  );
}
