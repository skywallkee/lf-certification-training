import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exportPath, itemToSource } from "@lfct/curriculum";
import { deleteItemAction, restoreRevisionAction, revertToFileAction, setPublishedAction } from "@/app/actions/content";
import { ContentEditor } from "@/components/admin/content-editor";
import { PageHeader } from "@/components/page-header";
import { DraftBadge, SampleBadge } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { competencyPath } from "@/server/catalog";
import { certOptions, getFileVersion, getItem, getRevisions, isItemType, TYPE_LABEL } from "@/server/content";
import { requireAdmin } from "@/server/session";

type Params = { type: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { type, id } = await params;
  return { title: isItemType(type) ? `Edit ${TYPE_LABEL[type].one} ${decodeURIComponent(id)}` : "Edit" };
}

const SAVED: Record<string, string> = {
  new: "Created as a draft. Publish it when it is ready.",
  "1": "Saved.",
  published: "Published: learners can see it now.",
  unpublished: "Unpublished: learners no longer see it.",
  reverted: "Reverted to the file version. The next ingest keeps it in step with the file again.",
  restored: "Restored that version.",
};

const ERRORS: Record<string, string> = {
  "known-issue": "This question has a known issue. Clear it before publishing.",
  "file-item": "Items that come from content/ cannot be deleted here: unpublish them, or remove the file.",
  "in-use": "Learners have already used this item, so it cannot be deleted. Unpublish it instead.",
  "no-file-version": "There is no file version to go back to.",
  "restore-invalid": "That version no longer passes validation (the curriculum or format changed). Open it in the Source view and fix it instead.",
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  published: "Published",
  unpublished: "Unpublished",
  deleted: "Deleted",
  restored: "Restored an earlier version",
  reverted: "Reverted to the file version",
  "file-version": "File version kept before the first edit",
};

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function EditItemPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const { type, id: rawId } = await params;
  if (!isItemType(type)) notFound();
  const id = decodeURIComponent(rawId);
  const item = await getItem(type, id);
  if (!item) notFound();
  const [revisions, fileVersion, certs] = await Promise.all([getRevisions(type, id), getFileVersion(type, id), certOptions()]);
  const { saved, error } = await searchParams;
  const { meta, edit } = item;
  const path = exportPath(type, edit);
  const learnerHref =
    type === "lab" ? `/labs/${id}` : type === "mock" ? `/mocks/${id}` : type === "lesson" && meta.published ? competencyPath(edit.competencies[0]!) : null;
  const current = revisions.findIndex((r) => r.hasSnapshot && r.action !== "file-version");
  const hidden = (
    <>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
    </>
  );

  return (
    <>
      <PageHeader
        title={meta.title || id}
        eyebrow={
          <>
            <Link href="/admin">Admin</Link> / <Link href={`/admin/content?type=${type}`}>Content</Link> / {TYPE_LABEL[type].one}
          </>
        }
        lead={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{id}</span>
            <span>· {meta.certCode}</span>
            {meta.published ? <span className="text-success">· Published</span> : <DraftBadge />}
            {meta.mock ? <SampleBadge /> : null}
          </span>
        }
      />
      {saved && SAVED[saved] ? (
        <p role="status" className="mb-4 rounded-md border border-success/40 bg-success-soft px-4 py-3 text-sm">
          {SAVED[saved]}
        </p>
      ) : null}
      {error && ERRORS[error] ? (
        <p role="alert" className="mb-4 rounded-md border border-destructive/50 bg-destructive-soft px-4 py-3 text-sm">
          {ERRORS[error]}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ContentEditor key={meta.updatedAt.toISOString()} type={type} originalId={id} initial={edit as unknown as Record<string, unknown>} initialSource={itemToSource(type, edit)} certs={certs} />
        <aside className="flex flex-col gap-4" aria-label="Item status and history">
          <Card className="flex flex-col gap-3 p-4" aria-labelledby="status-heading">
            <CardTitle id="status-heading">Status</CardTitle>
            <p className="text-sm">{meta.published ? "Published: learners see it." : "Draft: only admins see it."}</p>
            <form action={setPublishedAction}>
              {hidden}
              <input type="hidden" name="publish" value={meta.published ? "0" : "1"} />
              <Button type="submit" size="sm" variant={meta.published ? "outline" : "default"} className="w-full">
                {meta.published ? "Unpublish" : "Publish"}
              </Button>
            </form>
            {learnerHref ? (
              <Link href={learnerHref} className="text-sm">
                {type === "lab" || type === "mock" ? "Open as a learner (try it)" : "Open the learner page"}
              </Link>
            ) : null}
          </Card>
          <Card className="flex flex-col gap-3 p-4" aria-labelledby="source-heading">
            <CardTitle id="source-heading">Source</CardTitle>
            <p className="text-sm">
              {meta.origin === "file" ? (
                <>
                  Loaded from <code className="text-xs">content/{meta.file}</code>. Saving here makes the app version win over the file until you revert.
                </>
              ) : meta.file === "app" ? (
                "Created in the app. It exists only in the database until you commit its file."
              ) : (
                <>
                  Edited in the app; the file <code className="text-xs">content/{meta.file}</code> is ignored by the ingest until you revert.
                </>
              )}
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/admin/content/${type}/${encodeURIComponent(id)}`} download>
                Download file
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Commit it as <code>{path}</code> to keep it in the repository.
            </p>
            {meta.origin === "app" && fileVersion ? (
              <form action={revertToFileAction}>
                {hidden}
                <Button type="submit" size="sm" variant="outline" className="w-full">
                  Revert to file version
                </Button>
              </form>
            ) : null}
            {meta.origin === "app" ? (
              <form action={deleteItemAction}>
                {hidden}
                <Button type="submit" size="sm" variant="destructive" className="w-full">
                  Delete {TYPE_LABEL[type].one}
                </Button>
              </form>
            ) : null}
          </Card>
          <Card className="flex flex-col gap-2 p-4" aria-labelledby="history-heading">
            <CardTitle id="history-heading">History</CardTitle>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No edits in the app yet.</p>
            ) : (
              <ol className="flex flex-col divide-y text-sm">
                {revisions.map((r, i) => (
                  <li key={r.id} className="flex flex-col gap-0.5 py-2">
                    <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {when.format(r.createdAt)} UTC{r.by ? ` · ${r.by}` : ""}
                    </span>
                    {r.hasSnapshot && i !== current ? (
                      <form action={restoreRevisionAction}>
                        <input type="hidden" name="revision" value={r.id} />
                        <button type="submit" className="min-h-6 text-left text-xs text-primary hover:underline">
                          Restore this version
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
