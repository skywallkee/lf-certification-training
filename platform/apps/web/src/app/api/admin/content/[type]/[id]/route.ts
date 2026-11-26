import { exportPath, itemToSource } from "@lfct/curriculum";
import { getItem, isItemType } from "@/server/content";
import { getUser } from "@/server/session";

/** Downloads an item in its content file format (MDX or YAML), ready to commit under content/. Admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const user = await getUser();
  if (user?.role !== "admin") return new Response("Not found", { status: 404 });
  const { type, id } = await params;
  if (!isItemType(type)) return new Response("Not found", { status: 404 });
  const item = await getItem(type, decodeURIComponent(id));
  if (!item) return new Response("Not found", { status: 404 });
  const name = exportPath(type, item.edit).split("/").pop()!;
  return new Response(itemToSource(type, item.edit), {
    headers: {
      "content-type": type === "lesson" ? "text/markdown; charset=utf-8" : "application/yaml; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
