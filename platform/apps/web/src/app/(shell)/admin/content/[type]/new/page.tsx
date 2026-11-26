import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemToSource } from "@lfct/curriculum";
import { ContentEditor } from "@/components/admin/content-editor";
import { PageHeader } from "@/components/page-header";
import { certOptions, isItemType, newItemTemplate, TYPE_LABEL } from "@/server/content";
import { requireAdmin } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return { title: isItemType(type) ? `New ${TYPE_LABEL[type].one}` : "New item" };
}

export default async function NewItemPage({ params }: { params: Promise<{ type: string }> }) {
  await requireAdmin();
  const { type } = await params;
  if (!isItemType(type)) notFound();
  const initial = newItemTemplate(type);
  return (
    <>
      <PageHeader
        title={`New ${TYPE_LABEL[type].one}`}
        eyebrow={
          <>
            <Link href="/admin">Admin</Link> / <Link href={`/admin/content?type=${type}`}>Content</Link>
          </>
        }
        lead="It is saved as a draft. Publish it from its page when it is ready."
      />
      <div className="max-w-4xl">
        <ContentEditor type={type} originalId={null} initial={initial} initialSource={itemToSource(type, initial)} certs={await certOptions()} />
      </div>
    </>
  );
}
