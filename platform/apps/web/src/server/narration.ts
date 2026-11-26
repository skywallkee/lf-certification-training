import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { estimateSeconds, narrationHash, splitSentences, type Diagrams, type Video } from "@lfct/curriculum";
import { lesson as lessonTable } from "@lfct/curriculum/db";
import type { PlayerScene } from "@/components/lesson-video";
import { getDb } from "@/db";
import { env } from "@/env";

/**
 * Lesson video narration. Every narrated sentence is addressed by narrationHash(voice, speed, text): the player
 * asks /api/narration/<lesson>/<hash>, the server checks the hash belongs to that lesson's current script, and
 * answers from the cache folder or asks the narrator service (Kokoro) once and keeps the MP3. Changing a sentence
 * changes its hash, so stale audio is never served and browsers can cache each file for good.
 */

export interface NarratedSentence {
  hash: string;
  text: string;
  voice: string;
  speed: number;
}

export function narratedSentences(video: Video): NarratedSentence[] {
  return video.scenes.flatMap((s) => splitSentences(s.narration).map((text) => ({ text, voice: video.voice, speed: video.speed, hash: narrationHash(video.voice, video.speed, text) })));
}

/** Player props for a lesson video. `lessonId` "preview" makes admin-only URLs that carry the text (editor preview). */
export function playerScenes(lessonId: string, video: Video, diagrams: Diagrams): PlayerScene[] {
  const narrator = Boolean(env.narration.narratorUrl);
  return video.scenes.map((s) => ({
    id: s.id,
    title: s.title,
    visual: s.visual,
    ...(s.visual.kind === "diagram" && diagrams[s.visual.diagram] ? { diagram: diagrams[s.visual.diagram] } : {}),
    sentences: splitSentences(s.narration).map((text) => {
      const hash = narrationHash(video.voice, video.speed, text);
      const query = lessonId === "preview" ? `?${new URLSearchParams({ t: text, v: video.voice, s: String(video.speed) })}` : "";
      return { text, est: estimateSeconds(text, video.speed) + 0.25, src: narrator ? `/api/narration/${encodeURIComponent(lessonId)}/${hash}${query}` : null };
    }),
  }));
}

function fileOf(hash: string) {
  return path.join(env.narration.cacheDir, `${hash}.mp3`);
}

export async function cachedNarration(hash: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{32}$/.test(hash)) return null;
  try {
    return await readFile(fileOf(hash));
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<Buffer>>();

/** The MP3 for one sentence: from the cache, or synthesised by the narrator (one request per sentence at a time). */
export async function narrate(s: NarratedSentence): Promise<Buffer> {
  const cached = await cachedNarration(s.hash);
  if (cached) return cached;
  const url = env.narration.narratorUrl;
  if (!url) throw new NarratorUnavailable("NARRATOR_URL is not set");
  let job = inFlight.get(s.hash);
  if (!job) {
    job = (async () => {
      const res = await fetch(`${url.replace(/\/$/, "")}/speak`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: s.text, voice: s.voice, speed: s.speed }),
        signal: AbortSignal.timeout(120_000),
      }).catch((err: unknown) => {
        throw new NarratorUnavailable(err instanceof Error ? err.message : String(err));
      });
      if (!res.ok) throw new NarratorUnavailable(`narrator answered ${res.status}`);
      const audio = Buffer.from(await res.arrayBuffer());
      await mkdir(env.narration.cacheDir, { recursive: true });
      const tmp = `${fileOf(s.hash)}.${process.pid}.tmp`;
      await writeFile(tmp, audio);
      await rename(tmp, fileOf(s.hash));
      return audio;
    })().finally(() => inFlight.delete(s.hash));
    inFlight.set(s.hash, job);
  }
  return job;
}

export class NarratorUnavailable extends Error {}

/** The sentence with this hash in a lesson's current video, if any (and if learners may see the lesson). */
export async function lessonSentence(lessonId: string, hash: string, admin: boolean): Promise<NarratedSentence | null> {
  const [row] = await getDb().select({ video: lessonTable.video, published: lessonTable.published }).from(lessonTable).where(eq(lessonTable.id, lessonId));
  if (!row?.video || (!row.published && !admin)) return null;
  return narratedSentences(row.video).find((s) => s.hash === hash) ?? null;
}

/**
 * Synthesises every missing sentence of the published lesson videos, one at a time, so learners rarely wait for
 * the narrator. Run at start-up and after a lesson is saved. Returns how many files it made.
 */
export async function prewarmNarration(onlyLesson?: string): Promise<{ made: number; cached: number; failed: number }> {
  if (!env.narration.narratorUrl) return { made: 0, cached: 0, failed: 0 };
  const rows = await getDb().select({ id: lessonTable.id, video: lessonTable.video, published: lessonTable.published }).from(lessonTable);
  let made = 0;
  let cached = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.video || (onlyLesson ? row.id !== onlyLesson : !row.published)) continue;
    for (const s of narratedSentences(row.video)) {
      if (await cachedNarration(s.hash)) {
        cached++;
        continue;
      }
      try {
        await narrate(s);
        made++;
      } catch {
        failed++;
        if (failed >= 3 && made === 0) return { made, cached, failed };
      }
    }
  }
  return { made, cached, failed };
}
