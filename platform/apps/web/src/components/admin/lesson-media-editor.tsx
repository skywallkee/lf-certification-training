"use client";

import { ChevronDown, ChevronUp, Clapperboard, Plus, Trash2, WandSparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { parse, stringify } from "yaml";
import { draftVideoAction } from "@/app/actions/content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, FieldHint, Select } from "@/components/ui/field";
import { Field, NumberField, TextAreaField, TextField } from "./fields";

/**
 * Editors for the rich parts of a lesson (front matter `diagrams` and `video`, see content/README.md): diagrams as
 * YAML, and the video as a list of scenes, each with its narration and a visual. "Draft from the lesson" builds a
 * first script from the body's sections. The server checks everything again on save and in the Preview tab.
 */

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const objs = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);

/** Same split as splitSentences in @lfct/curriculum (kept here so the client bundle stays free of node modules). */
function sentenceCount(text: string) {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["'`(]?[A-Z0-9])/).filter(Boolean).length;
}

export const VOICES = [
  { id: "af_heart", label: "Heart (US English, female)" },
  { id: "af_bella", label: "Bella (US English, female)" },
  { id: "am_michael", label: "Michael (US English, male)" },
  { id: "am_fenrir", label: "Fenrir (US English, male)" },
  { id: "bf_emma", label: "Emma (UK English, female)" },
  { id: "bm_george", label: "George (UK English, male)" },
];

/** The lesson's diagrams as YAML. Keeps the text while it does not parse, and shows why. */
export function DiagramsField({ value, onChange }: { value: unknown; onChange: (v: Obj) => void }) {
  const [text, setText] = useState(() => (value && typeof value === "object" && Object.keys(value).length > 0 ? stringify(value, { lineWidth: 0 }) : ""));
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <TextAreaField
        label="Diagrams (YAML)"
        mono
        rows={10}
        value={text}
        onChange={(t) => {
          setText(t);
          try {
            const v: unknown = t.trim() ? parse(t) : {};
            if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("expected a mapping of diagram ids");
            setProblem(null);
            onChange(v as Obj);
          } catch (err) {
            setProblem((err as Error).message);
          }
        }}
        hint={
          <>
            One entry per diagram id, with <code>title</code>, <code>nodes</code> (id, label, sub, icon, col, row, tone), <code>edges</code> (from, to, label, dashed) and{" "}
            <code>groups</code> (id, label, nodes). Place one in the body with <code>{'<Diagram id="…" />'}</code>; video scenes can show it step by step.
          </>
        }
      />
      {problem ? <FieldError>Diagrams YAML: {problem}</FieldError> : null}
    </div>
  );
}

const KINDS = [
  { id: "title", label: "Title card" },
  { id: "points", label: "Points (one per sentence)" },
  { id: "diagram", label: "Diagram, step by step" },
  { id: "code", label: "Code, lines highlighted" },
  { id: "terminal", label: "Terminal, commands typed" },
];

function defaultVisual(kind: string, scene: Obj, diagramIds: string[]): Obj {
  const title = str(scene.title);
  if (kind === "points") return { kind, heading: title, items: ["First point"] };
  if (kind === "diagram") return { kind, diagram: diagramIds[0] ?? "" };
  if (kind === "code") return { kind, lang: "yaml", code: "apiVersion: v1\n" };
  if (kind === "terminal") return { kind, lines: [{ cmd: "kubectl get pods" }] };
  return { kind: "title", heading: title || "Title" };
}

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

/** Terminal lines as text: "$ command" starts a line, anything below it is that command's output. */
function terminalToText(ls: Obj[]) {
  return ls.map((l) => `$ ${str(l.cmd)}${l.out ? `\n${str(l.out)}` : ""}`).join("\n");
}
function terminalFromText(text: string): Obj[] {
  const out: Obj[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("$ ")) out.push({ cmd: line.slice(2) });
    else if (out.length > 0 && line.trim()) {
      const last = out[out.length - 1]!;
      last.out = last.out ? `${str(last.out)}\n${line}` : line;
    }
  }
  return out;
}

function VisualFields({ visual, onChange, diagramIds }: { visual: Obj; onChange: (v: Obj) => void; diagramIds: string[] }) {
  const set = (patch: Obj) => onChange({ ...visual, ...patch });
  switch (visual.kind) {
    case "points":
      return (
        <>
          <TextField label="Visual heading" value={str(visual.heading)} onChange={(heading) => set({ heading: heading || undefined })} />
          <TextAreaField label="Points, one per line" rows={4} value={(visual.items as string[] | undefined)?.join("\n") ?? ""} onChange={(t) => set({ items: lines(t) })} hint="Each point appears when the narration reaches the sentence with the same number." />
        </>
      );
    case "diagram":
      return (
        <>
          <Field label="Diagram">
            {(id) => (
              <Select id={id} value={str(visual.diagram)} onChange={(e) => set({ diagram: e.target.value })}>
                {diagramIds.length === 0 ? <option value="">Add a diagram above first</option> : null}
                {diagramIds.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TextAreaField
            label="Steps, one per line"
            mono
            rows={4}
            value={((visual.steps as string[][] | undefined) ?? []).map((s) => s.join(", ")).join("\n")}
            onChange={(t) => {
              const steps = lines(t).map((l) => l.split(",").map((x) => x.trim()).filter(Boolean));
              set({ steps: steps.length ? steps : undefined });
            }}
            hint="Node, edge (from-to) or group ids, comma separated. Step 1 shows with sentence 1, and so on; anything never named is visible from the start."
          />
        </>
      );
    case "code":
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <TextField label="Visual heading" value={str(visual.heading)} onChange={(heading) => set({ heading: heading || undefined })} />
            <TextField label="Language" mono value={str(visual.lang)} onChange={(lang) => set({ lang })} />
          </div>
          <TextAreaField label="Code" mono rows={8} value={str(visual.code)} onChange={(code) => set({ code })} />
          <TextAreaField
            label="Highlighted lines per step, one per line"
            mono
            rows={3}
            value={((visual.steps as string[] | undefined) ?? []).join("\n")}
            onChange={(t) => set({ steps: lines(t).length ? lines(t) : undefined })}
            hint='Line numbers such as "3" or "4-6" or "1,8". Step 1 is lit during sentence 1.'
          />
        </>
      );
    case "terminal":
      return (
        <TextAreaField
          label="Session"
          mono
          rows={6}
          value={terminalToText(objs(visual.lines))}
          onChange={(t) => set({ lines: terminalFromText(t) })}
          hint='Start each command with "$ "; lines under it are its output. One command is typed per sentence.'
        />
      );
    default:
      return (
        <>
          <TextField label="Visual heading" value={str(visual.heading)} onChange={(heading) => set({ heading })} />
          <TextField label="Visual subheading" value={str(visual.subheading)} onChange={(subheading) => set({ subheading: subheading || undefined })} />
        </>
      );
  }
}

export function VideoField({ lesson, onChange }: { lesson: Obj; onChange: (video: Obj | undefined) => void }) {
  const video = lesson.video as Obj | undefined;
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const diagramIds = lesson.diagrams && typeof lesson.diagrams === "object" ? Object.keys(lesson.diagrams) : [];
  const scenes = objs(video?.scenes);
  const setVideo = (patch: Obj) => onChange({ voice: "af_heart", speed: 1, ...video, ...patch });
  const setScene = (i: number, patch: Obj) => setVideo({ scenes: scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const next = [...scenes];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s!);
    setVideo({ scenes: next });
  };

  const draft = () => {
    if (scenes.length > 0 && !window.confirm("Replace the current scenes with a new draft from the lesson body?")) return;
    setProblem(null);
    startTransition(async () => {
      const r = await draftVideoAction(JSON.stringify(lesson));
      if (!r.ok) return setProblem(r.problem);
      onChange(r.video);
    });
  };

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        <Clapperboard aria-hidden="true" className="size-4" />
        Lesson video
      </legend>
      <FieldHint>
        An animated, narrated walk through the lesson. Each scene has narration and a visual that moves one step per sentence. Write the narration as you would say it: short
        sentences, no code read aloud. Check it in the Preview tab.
      </FieldHint>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={draft} disabled={pending}>
          <WandSparkles aria-hidden="true" className="size-4" />
          {pending ? "Drafting…" : scenes.length ? "Redraft from the lesson" : "Draft from the lesson"}
        </Button>
        {video ? (
          <Button type="button" variant="outline" onClick={() => onChange(undefined)}>
            <Trash2 aria-hidden="true" className="size-4" />
            Remove the video
          </Button>
        ) : null}
      </div>
      {problem ? <FieldError>{problem}</FieldError> : null}

      {video ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Narrator voice" hint="Used by the local narrator. Without it, learners hear their browser's voice.">
              {(id) => (
                <Select id={id} value={str(video.voice) || "af_heart"} onChange={(e) => setVideo({ voice: e.target.value })}>
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <NumberField label="Speaking speed (0.7 to 1.3)" value={typeof video.speed === "number" ? video.speed : 1} min={0.7} max={1.3} onChange={(speed) => setVideo({ speed: speed ?? 1 })} />
          </div>
          <ol className="flex flex-col gap-3">
            {scenes.map((scene, i) => {
              const visual = (scene.visual as Obj | undefined) ?? { kind: "title" };
              const count = sentenceCount(str(scene.narration));
              return (
                <li key={i}>
                  <Card className="flex flex-col gap-4 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Scene {i + 1}</span>
                      <span className="ml-auto flex gap-1">
                        <Button type="button" variant="ghost" size="sm" aria-label={`Move scene ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ChevronUp aria-hidden="true" className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Move scene ${i + 1} down`} disabled={i === scenes.length - 1} onClick={() => move(i, 1)}>
                          <ChevronDown aria-hidden="true" className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Remove scene ${i + 1}`} onClick={() => setVideo({ scenes: scenes.filter((_, j) => j !== i) })}>
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                      <TextField label={`Scene ${i + 1} title`} value={str(scene.title)} maxLength={80} onChange={(title) => setScene(i, { title })} />
                      <TextField label={`Scene ${i + 1} id`} mono value={str(scene.id)} onChange={(id) => setScene(i, { id })} />
                    </div>
                    <TextAreaField
                      label={`Scene ${i + 1} narration`}
                      rows={4}
                      value={str(scene.narration)}
                      onChange={(narration) => setScene(i, { narration })}
                      hint={`${count} sentence${count === 1 ? "" : "s"}. Each sentence moves the visual one step.`}
                    />
                    <Field label={`Scene ${i + 1} visual`}>
                      {(id) => (
                        <Select id={id} value={str(visual.kind)} onChange={(e) => setScene(i, { visual: defaultVisual(e.target.value, scene, diagramIds) })}>
                          {KINDS.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <VisualFields visual={visual} diagramIds={diagramIds} onChange={(v) => setScene(i, { visual: v })} />
                  </Card>
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVideo({ scenes: [...scenes, { id: `scene-${scenes.length + 1}`, title: "New scene", narration: "", visual: { kind: "title", heading: "New scene" } }] })}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add a scene
            </Button>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
