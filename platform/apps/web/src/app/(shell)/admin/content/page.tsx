import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DraftBadge, SampleBadge } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { isItemType, listItems, TYPE_LABEL, type ItemMeta } from "@/server/content";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin: content" };

const TYPES = ["lesson", "question", "lab", "mock"] as const;
const STATUS: Record<string, { label: string; test: (i: ItemMeta) => boolean }> = {
  all: { label: "Any status", test: () => true },
  draft: { label: "Drafts", test: (i) => !i.published },
  published: { label: "Published", test: (i) => i.published },
  app: { label: "Edited in the app", test: (i) => i.origin === "app" },
  file: { label: "From files only", test: (i) => i.origin === "file" },
};

function Origin({ item }: { item: ItemMeta }) {
  if (item.origin === "file") return <span className="text-muted-foreground">File</span>;
  return <span className="font-medium text-primary">{item.file === "app" ? "Created in app" : "Edited in app"}</span>;
}

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ type?: string; cert?: string; status?: string; q?: string; deleted?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const type = params.type && isItemType(params.type) ? params.type : null;
  const status = params.status && STATUS[params.status] ? params.status : "all";
  const q = (params.q ?? "").trim().toLowerCase();
  const all = await listItems();
  const certs = [...new Set(all.map((i) => i.certCode))].sort();
  const cert = params.cert && certs.includes(params.cert) ? params.cert : null;
  const items = all.filter(
    (i) => (!type || i.type === type) && (!cert || i.certCode === cert) && STATUS[status]!.test(i) && (!q || i.id.includes(q) || i.title.toLowerCase().includes(q)),
  );
  const counts = Object.fromEntries(TYPES.map((t) => [t, all.filter((i) => i.type === t).length]));
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { type, cert, status: status === "all" ? null : status, q: q || null, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/content?${s}` : "/admin/content";
  };

  return (
    <>
      <PageHeader
        title="Content"
        eyebrow={<Link href="/admin">Admin</Link>}
        lead="Create and edit lessons, questions, labs and mock exams. Changes made here are kept when content/ is ingested again."
        actions={TYPES.map((t) => (
          <Button key={t} asChild size="sm" variant={t === "lesson" ? "default" : "outline"}>
            <Link href={`/admin/content/${t}/new`}>New {TYPE_LABEL[t].one}</Link>
          </Button>
        ))}
      />
      {params.deleted ? (
        <p role="status" className="mb-4 rounded-md border border-success/40 bg-success-soft px-4 py-3 text-sm">
          Deleted {params.deleted}.
        </p>
      ) : null}
      <nav aria-label="Content type" className="mb-4 flex flex-wrap gap-2">
        <Link href={href({ type: null })} aria-current={type === null ? "page" : undefined} className={chip(type === null)}>
          All ({all.length})
        </Link>
        {TYPES.map((t) => (
          <Link key={t} href={href({ type: t })} aria-current={type === t ? "page" : undefined} className={chip(type === t)}>
            {TYPE_LABEL[t].many} ({counts[t]})
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/content">
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-q">Search</Label>
          <Input id="filter-q" name="q" defaultValue={q} placeholder="Id or title" className="w-56" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-cert">Cert</Label>
          <Select id="filter-cert" name="cert" defaultValue={cert ?? ""} className="w-32">
            <option value="">All certs</option>
            {certs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Select id="filter-status" name="status" defaultValue={status} className="w-48">
            {Object.entries(STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <Card className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-[15px] text-muted-foreground">Nothing matches. Clear the filters or create a new item.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Content items</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Item</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cert</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Source</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.type}:${i.id}`} className="border-t">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/content/${i.type}/${encodeURIComponent(i.id)}`} className="font-medium">
                        {i.title || i.id}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
                        {i.published ? null : <DraftBadge />}
                        {i.mock ? <SampleBadge /> : null}
                        {i.knownIssue ? <span className="text-xs font-semibold text-warning">Known issue</span> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{TYPE_LABEL[i.type].one}</td>
                    <td className="px-4 py-2.5">{i.certCode}</td>
                    <td className="px-4 py-2.5">
                      <Origin item={i} />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{i.updatedAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[13px] text-muted-foreground">
        Showing {items.length} of {all.length}. To keep an item in the repository, open it and download its file into the path shown, then commit it.
      </p>
    </>
  );
}

function chip(active: boolean) {
  return `inline-flex min-h-9 items-center rounded-full border px-3 text-sm no-underline ${active ? "border-primary bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-muted"}`;
}
