import { narrationHash, NARRATION_VOICES } from "@lfct/curriculum";
import { NextResponse } from "next/server";
import { lessonSentence, narrate, NarratorUnavailable, type NarratedSentence } from "@/server/narration";
import { getUser } from "@/server/session";

/**
 * One narrated sentence of a lesson video, as MP3. /api/narration/<lesson id>/<hash> serves sentences of a saved
 * lesson's video; /api/narration/preview/<hash>?t=&v=&s= serves unsaved text from the editor's preview, for admins
 * only. 503 means the narrator is not running: the player then uses the browser's voice.
 */
export async function GET(request: Request, { params }: { params: Promise<{ lesson: string; hash: string }> }) {
  const { lesson, hash } = await params;
  if (!/^[0-9a-f]{32}$/.test(hash)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getUser();
  const admin = user?.role === "admin";
  let sentence: NarratedSentence | null = null;
  if (lesson === "preview") {
    if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const q = new URL(request.url).searchParams;
    const text = q.get("t") ?? "";
    const voice = q.get("v") ?? "";
    const speed = Number(q.get("s") ?? "1");
    if (!(NARRATION_VOICES as readonly string[]).includes(voice) || !(speed >= 0.7 && speed <= 1.3) || text.length > 1500) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    if (narrationHash(voice, speed, text) === hash) sentence = { hash, text, voice, speed };
  } else {
    sentence = await lessonSentence(lesson, hash, admin);
  }
  if (!sentence) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const audio = await narrate(sentence);
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(audio.length),
        // Content-addressed: the same URL always holds the same audio.
        "cache-control": lesson === "preview" ? "private, max-age=86400" : "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err instanceof NarratorUnavailable) return NextResponse.json({ error: "narrator unavailable" }, { status: 503 });
    throw err;
  }
}
