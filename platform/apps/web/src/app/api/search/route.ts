import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/server/search";

/** Quick search (the header dialog): the best eight results for ?q=. Same content as the Search page. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const results = q.trim() ? await search(q, { limit: 8 }) : [];
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
