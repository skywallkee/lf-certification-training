"use client";

import type { Diagram, VideoVisual } from "@lfct/curriculum";
import { Captions, ChevronLeft, ChevronRight, ListVideo, Maximize, Minimize, Pause, Play, RotateCcw } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiagramView } from "@/components/diagram";
import { cn } from "@/lib/utils";

/**
 * The lesson video: an animated, narrated walk through the lesson, built from the lesson's own data (front matter
 * `video`, lesson-media.ts) rather than a rendered file, so it always matches the written lesson and costs nothing
 * to host. Each scene has a visual (title card, points, one of the lesson's diagrams, code, or a terminal) that
 * advances one step per narrated sentence.
 *
 * Narration: each sentence is an MP3 from the local narrator (Kokoro), fetched from /api/narration and cached. If
 * the narrator is not running or a file fails, the player switches to the browser's own speech voice
 * (speechSynthesis), and with neither it advances on a timer with captions. Keyboard: Space or K plays and
 * pauses, J and L step back and forward a sentence, C toggles captions, F full screen.
 */

export interface PlayerSentence {
  text: string;
  /** Narration audio URL, or null to use the browser's voice. */
  src: string | null;
  /** Estimated seconds, for the timeline. */
  est: number;
}
export interface PlayerScene {
  id: string;
  title: string;
  sentences: PlayerSentence[];
  visual: VideoVisual;
  diagram?: Diagram;
}

type Voice = "narrator" | "browser" | "silent";

const GAP_MS = 220;
const SCENE_GAP_MS = 650;
const RATES = [0.75, 1, 1.25, 1.5];

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const rank = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 0 : /google|samantha|aria|jenny|daniel/i.test(v.name) ? 1 : v.lang === "en-US" ? 2 : 3);
  return voices.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function linesOf(range: string): number[] {
  return range.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    if (b === undefined) return [a!];
    return Array.from({ length: Math.max(0, b - a! + 1) }, (_, i) => a! + i);
  });
}

/**
 * Font size for code and terminal visuals, in container units of the stage, so the longest line and every row fit
 * the 16:9 frame at any player size instead of being cut off.
 */
function fitFont(rows: string[], room = { w: 84, h: 66 }) {
  const chars = Math.max(20, ...rows.map((r) => r.length + 4));
  return { fontSize: `min(${(room.w / (chars * 0.62)).toFixed(3)}cqw, ${(room.h / (rows.length * 1.65)).toFixed(3)}cqh, 2.4cqw)` };
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The visual of one scene at a given step (the index of the sentence being spoken). */
function SceneVisual({ visual, diagram, step }: { visual: VideoVisual; diagram?: Diagram; step: number }) {
  switch (visual.kind) {
    case "title":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <h3 className="video-pop text-[clamp(1.4rem,4vw,2.6rem)] font-bold leading-tight">{visual.heading}</h3>
          {visual.subheading ? (
            <p className="video-pop max-w-[46ch] text-[clamp(0.9rem,2vw,1.2rem)] text-muted-foreground" style={{ animationDelay: "250ms" }}>
              {visual.subheading}
            </p>
          ) : null}
        </div>
      );
    case "points":
      return (
        <div className="flex h-full flex-col justify-center gap-4 px-[6%]">
          {visual.heading ? <h3 className="text-[clamp(1.1rem,3vw,1.8rem)] font-bold">{visual.heading}</h3> : null}
          <ul className="flex flex-col gap-3">
            {visual.items.map((item, i) => (
              <li
                key={item}
                className={cn(
                  "flex items-start gap-3 text-[clamp(0.95rem,2.2vw,1.3rem)] transition-all duration-500 motion-reduce:transition-none",
                  i <= step ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  i === step ? "font-semibold" : i < step ? "text-muted-foreground" : "",
                )}
              >
                <span aria-hidden="true" className={cn("mt-[0.45em] size-2.5 shrink-0 rounded-full", i === step ? "bg-primary" : "bg-muted-foreground/50")} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      );
    case "diagram": {
      if (!diagram) return <p className="p-6 text-destructive">Diagram {visual.diagram} is missing.</p>;
      const steps = visual.steps ?? [];
      const stepped = new Set(steps.flat());
      const visible = new Set(
        [...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id ?? `${e.from}-${e.to}`), ...diagram.groups.map((g) => g.id)].filter(
          (id) => !stepped.has(id) || steps.slice(0, step + 1).some((s) => s.includes(id)),
        ),
      );
      const highlight = new Set(steps[step] ?? []);
      return (
        <div className="h-full px-[3%] pb-[2%]">
          <DiagramView diagram={diagram} visible={visible} highlight={highlight} showCaption={false} fit className="h-full w-full" />
        </div>
      );
    }
    case "code": {
      const lines = visual.code.replace(/\n$/, "").split("\n");
      const lit = new Set(visual.steps?.[step] ? linesOf(visual.steps[step]) : []);
      return (
        <div className="flex h-full flex-col justify-center gap-3 px-[5%]">
          {visual.heading ? <h3 className="text-[clamp(1rem,2.6vw,1.5rem)] font-bold">{visual.heading}</h3> : null}
          <pre className="overflow-hidden rounded-lg bg-terminal p-[2cqw] font-mono leading-[1.5] text-terminal-foreground" style={fitFont(lines, { w: 80, h: visual.heading ? 58 : 68 })}>
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "-mx-2 rounded px-2 transition-all duration-500 motion-reduce:transition-none",
                  lit.size > 0 && !lit.has(i + 1) && "opacity-35",
                  lit.has(i + 1) && "bg-white/10",
                )}
              >
                <span aria-hidden="true" className="mr-4 inline-block w-5 select-none text-right opacity-40">
                  {i + 1}
                </span>
                {line || " "}
              </div>
            ))}
          </pre>
        </div>
      );
    }
    case "terminal":
      return (
        <div className="flex h-full items-center px-[5%]">
          <div
            className="w-full overflow-hidden rounded-lg bg-terminal font-mono text-terminal-foreground shadow-lg"
            style={fitFont(visual.lines.flatMap((l) => [`$ ${l.cmd}`, ...(l.out ? l.out.split("\n") : [])]), { w: 82, h: 62 })}
          >
            <div className="flex gap-1.5 border-b border-white/10 px-3 py-2" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-white/25" />
              <span className="size-2.5 rounded-full bg-white/25" />
              <span className="size-2.5 rounded-full bg-white/25" />
            </div>
            <div className="flex flex-col gap-[0.3em] p-[1.6cqw] leading-[1.45]">
              {visual.lines.slice(0, step + 1).map((l, i) => (
                <div key={i}>
                  <div className="flex">
                    <span className="mr-2 text-success">$</span>
                    <span
                      className={cn("whitespace-pre", i === step && "video-type")}
                      style={i === step ? ({ "--chars": l.cmd.length } as CSSProperties) : undefined}
                    >
                      {l.cmd}
                    </span>
                  </div>
                  {l.out ? (
                    <pre className={cn("whitespace-pre opacity-80", i === step && "video-pop")} style={i === step ? { animationDelay: `${Math.min(1500, l.cmd.length * 35)}ms` } : undefined}>
                      {l.out}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
  }
}

export function LessonVideo({ title, scenes, rate: baseRate = 1 }: { title: string; scenes: PlayerScene[]; rate?: number }) {
  const flat = useMemo(() => scenes.flatMap((s, si) => s.sentences.map((sentence, i) => ({ ...sentence, scene: si, index: i }))), [scenes]);
  const starts = useMemo(() => {
    let t = 0;
    return flat.map((f) => {
      const at = t;
      t += f.est;
      return at;
    });
  }, [flat]);
  const total = flat.reduce((a, f) => a + f.est, 0);

  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [transcript, setTranscript] = useState(false);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<Voice>(() => (flat[0]?.src ? "narrator" : "browser"));
  const [full, setFull] = useState(false);

  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);
  const frame = useRef<HTMLDivElement>(null);

  const current = flat[pos];
  const scene = scenes[current?.scene ?? 0]!;

  const stopAll = useCallback(() => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => stopAll, [stopAll]);

  // Speak sentence `i`, then move on. Each call gets a run id so a pause or a jump cancels the old chain.
  const speak = useCallback(
    (i: number, mode: Voice) => {
      const id = ++run.current;
      const item = flat[i];
      if (!item) return;
      const next = () => {
        if (id !== run.current) return;
        if (i + 1 >= flat.length) {
          setPlaying(false);
          setEnded(true);
          return;
        }
        const gap = flat[i + 1]!.scene !== item.scene ? SCENE_GAP_MS : GAP_MS;
        timer.current = setTimeout(() => {
          if (id !== run.current) return;
          setPos(i + 1);
          speak(i + 1, mode);
        }, gap / rate);
      };
      const silent = () => {
        timer.current = setTimeout(next, (item.est * 1000) / rate);
      };
      if (mode === "narrator" && item.src) {
        const el = audio.current ?? new Audio();
        audio.current = el;
        el.src = item.src;
        el.playbackRate = rate;
        el.onended = next;
        el.onerror = () => {
          if (id !== run.current) return;
          // The narrator is not running or failed: use the browser's voice from here on.
          setVoice("browser");
          speak(i, "browser");
        };
        el.play().catch(() => {
          if (id === run.current) el.onerror?.(new Event("error"));
        });
        // Warm the next sentence so it starts without a gap.
        const following = flat[i + 1]?.src;
        if (following) fetch(following).catch(() => undefined);
        return;
      }
      if (mode !== "silent" && typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(item.text);
        const v = pickBrowserVoice();
        if (v) u.voice = v;
        u.lang = v?.lang ?? "en-US";
        u.rate = rate * baseRate;
        let started = false;
        const fallBack = () => {
          if (id !== run.current) return;
          setVoice("silent");
          silent();
        };
        u.onstart = () => {
          started = true;
        };
        u.onend = () => {
          if (timer.current) clearTimeout(timer.current);
          next();
        };
        u.onerror = (e) => {
          if (e.error === "interrupted" || e.error === "canceled") return;
          fallBack();
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        // Some browsers have no voices and never start speaking: continue with captions only.
        timer.current = setTimeout(() => {
          if (!started) {
            window.speechSynthesis.cancel();
            fallBack();
          }
        }, 2500);
        return;
      }
      silent();
    },
    [flat, rate, baseRate],
  );

  const play = useCallback(
    (from = pos) => {
      stopAll();
      const start = ended && from === pos ? 0 : from;
      setEnded(false);
      setPos(start);
      setPlaying(true);
      speak(start, voice);
    },
    [pos, ended, voice, speak, stopAll],
  );

  const pause = useCallback(() => {
    stopAll();
    setPlaying(false);
  }, [stopAll]);

  const seek = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(flat.length - 1, i));
      setEnded(false);
      if (playing) play(target);
      else {
        stopAll();
        setPos(target);
      }
    },
    [flat.length, playing, play, stopAll],
  );

  const sceneStart = (si: number) => flat.findIndex((f) => f.scene === si);

  // Restart the current sentence at the new speed (only when the speed changes, not on every position change).
  const lastRate = useRef(rate);
  useEffect(() => {
    if (lastRate.current === rate) return;
    lastRate.current = rate;
    if (playing) play(pos);
  }, [rate, playing, play, pos]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("select, [role=slider]")) return;
    const key = e.key.toLowerCase();
    if (key === " " || key === "k") {
      e.preventDefault();
      if (playing) pause();
      else play();
    } else if (key === "j") seek(pos - 1);
    else if (key === "l") seek(pos + 1);
    else if (key === "c") setCaptions((c) => !c);
    else if (key === "f") toggleFull();
  };

  const elapsed = (starts[pos] ?? 0) + (ended ? (current?.est ?? 0) : 0);
  const percent = total > 0 ? (elapsed / total) * 100 : 0;

  return (
    <section aria-label={`Lesson video: ${title}`} className="mb-8 max-w-[72ch]">
      <div ref={frame} onKeyDown={onKey} className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", full && "flex flex-col justify-center rounded-none border-0")}>
        <div className="relative aspect-video w-full overflow-hidden bg-surface [container-type:size]">
          <div className="absolute left-4 top-3 z-10 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
              {(current?.scene ?? 0) + 1}/{scenes.length}
            </span>
            <span className="truncate">{scene.title}</span>
          </div>
          <div key={scene.id} className="video-scene absolute inset-0 pt-8" aria-hidden="true">
            <SceneVisual visual={scene.visual} diagram={scene.diagram} step={current?.index ?? 0} />
          </div>
          {!playing ? (
            <button
              type="button"
              onClick={() => play()}
              className="group absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-background/70 via-transparent to-transparent pb-[6%]"
            >
              <span className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none">
                {ended ? <RotateCcw aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
                {ended ? "Watch again" : pos > 0 ? "Resume" : `Watch the lesson · ${fmt(total)}`}
              </span>
            </button>
          ) : null}
        </div>

        {captions && current ? (
          <p className="min-h-[3.5rem] border-t bg-terminal px-4 py-2 text-center text-[15px] leading-snug text-terminal-foreground" aria-hidden="true">
            {current.text}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 border-t px-3 py-2">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Position in the video"
            aria-valuemin={1}
            aria-valuemax={flat.length}
            aria-valuenow={pos + 1}
            aria-valuetext={`${fmt(elapsed)} of ${fmt(total)}, scene ${(current?.scene ?? 0) + 1}: ${scene.title}`}
            className="group relative h-4 cursor-pointer"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(pos + 1);
              else if (e.key === "ArrowLeft") seek(pos - 1);
              else if (e.key === "Home") seek(0);
              else if (e.key === "End") seek(flat.length - 1);
              else return;
              e.preventDefault();
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - r.left) / r.width) * total;
              let i = starts.findIndex((s, k) => t >= s && t < s + flat[k]!.est);
              if (i < 0) i = flat.length - 1;
              seek(i);
            }}
          >
            <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-muted" />
            <div className="absolute left-0 top-1.5 h-1 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
            {scenes.slice(1).map((s, si) => {
              const at = starts[sceneStart(si + 1)] ?? 0;
              return <span key={s.id} className="absolute top-1 h-2 w-0.5 bg-card" style={{ left: `${(at / total) * 100}%` }} />;
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => (playing ? pause() : play())} className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
            </button>
            <button type="button" onClick={() => seek(sceneStart(Math.max(0, (current?.scene ?? 0) - ((current?.index ?? 0) > 0 ? 0 : 1))))} className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted" aria-label="Previous scene">
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => seek(sceneStart(Math.min(scenes.length - 1, (current?.scene ?? 0) + 1)))} className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted" aria-label="Next scene">
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              {fmt(elapsed)} / {fmt(total)}
            </span>
            <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <select
                aria-label="Scene"
                className="h-9 max-w-[11rem] rounded-md border border-input bg-card px-2 text-xs text-foreground"
                value={current?.scene ?? 0}
                onChange={(e) => seek(sceneStart(Number(e.target.value)))}
              >
                {scenes.map((s, i) => (
                  <option key={s.id} value={i}>
                    {i + 1}. {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <select aria-label="Speed" className="h-9 rounded-md border border-input bg-card px-2 text-xs text-foreground" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setCaptions((c) => !c)} aria-pressed={captions} className={cn("inline-flex size-11 items-center justify-center rounded-md hover:bg-muted", captions && "text-primary")} aria-label="Captions">
              <Captions aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => setTranscript((t) => !t)} aria-pressed={transcript} aria-expanded={transcript} className={cn("inline-flex size-11 items-center justify-center rounded-md hover:bg-muted", transcript && "text-primary")} aria-label="Transcript">
              <ListVideo aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={toggleFull} className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted" aria-label={full ? "Exit full screen" : "Full screen"}>
              {full ? <Minimize aria-hidden="true" className="size-5" /> : <Maximize aria-hidden="true" className="size-5" />}
            </button>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {voice === "narrator" ? "Narrated by the local narrator voice." : voice === "browser" ? "Narrated by your browser's voice (the narrator service is not running)." : "No voice available: captions only."} Keys: Space plays and pauses, J and L step, C captions, F full screen.
          </p>
        </div>
      </div>

      {transcript ? (
        <ol className="mt-3 flex flex-col gap-3 rounded-lg border bg-card p-4 text-[15px]" aria-label="Transcript">
          {scenes.map((s, si) => (
            <li key={s.id}>
              <p className="mb-1 font-semibold">
                {si + 1}. {s.title}
              </p>
              <div className="flex flex-col">
                {s.sentences.map((t, i) => {
                  const k = sceneStart(si) + i;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => seek(k)}
                      className={cn("min-h-8 rounded px-2 py-1 text-left hover:bg-muted", k === pos && "bg-primary-soft font-medium")}
                      aria-current={k === pos ? "true" : undefined}
                    >
                      {t.text}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
