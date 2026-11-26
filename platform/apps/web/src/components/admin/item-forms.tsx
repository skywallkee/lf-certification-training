"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, Select } from "@/components/ui/field";
import {
  CheckboxField,
  CompetencyPicker,
  DocLinksField,
  Field,
  NumberField,
  StringListField,
  TextAreaField,
  TextField,
  type CertOption,
  type DocLink,
} from "./fields";

/**
 * Form views of the content file format, one per item type. They edit plain JSON shaped like the files
 * (content/README.md); the server validates it with the same schemas as the ingest. Fields the form does not
 * know about are kept as they are, so a format change never loses data: edit those in the Source view.
 */

type Obj = Record<string, unknown>;
export interface FormProps {
  value: Obj;
  onChange: (v: Obj) => void;
  certs: CertOption[];
  isNew: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const docs = (v: unknown) => (Array.isArray(v) ? (v as DocLink[]) : []);
const objs = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);

function IdField({ value, onChange, isNew }: { value: string; onChange: (v: string) => void; isNew: boolean }) {
  return (
    <Field label="Id" hint={isNew ? "Lowercase letters, digits and hyphens. It cannot change later: learner progress refers to it." : "Fixed: learner progress refers to it."}>
      {(id) => <input id={id} className="min-h-11 w-full rounded-md border border-input bg-card px-3 font-mono text-sm disabled:opacity-70" value={value} disabled={!isNew} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

const SAMPLE_HINT = "Shows the Sample content label. Keep it on while the content format may still change; the whole sample set can be removed in one step.";

export function LessonForm({ value, onChange, certs, isNew }: FormProps) {
  const set = (patch: Obj) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <IdField value={str(value.id)} onChange={(id) => set({ id })} isNew={isNew} />
        <NumberField label="Minutes to read" value={num(value.minutes)} min={1} max={120} onChange={(minutes) => set({ minutes })} />
      </div>
      <TextField label="Title" value={str(value.title)} maxLength={120} onChange={(title) => set({ title })} />
      <TextAreaField label="Summary" hint="One or two sentences, up to 280 characters. Shown in lists and search." rows={2} value={str(value.summary)} onChange={(summary) => set({ summary })} />
      <CompetencyPicker label="Competencies" hint="What the lesson teaches. The first one decides which cert the lesson belongs to." certs={certs} value={strs(value.competencies)} onChange={(competencies) => set({ competencies })} />
      <DocLinksField label="Official docs" value={docs(value.docs)} onChange={(d) => set({ docs: d })} />
      <TextAreaField
        label="Body (MDX)"
        mono
        rows={18}
        hint={
          <>
            Markdown with GitHub tables and code blocks. Components: <code>{'<Callout kind="tip" title="…">…</Callout>'}</code> (note, tip, warning) and{" "}
            <code>{'<Flow label="…" steps={["A", "B"]} />'}</code>. Use the Preview tab to check it.
          </>
        }
        value={str(value.body)}
        onChange={(body) => set({ body })}
      />
      <CheckboxField label="Sample content" hint={SAMPLE_HINT} checked={value.mock === true} onChange={(mock) => set({ mock })} />
    </div>
  );
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function QuestionForm({ value, onChange, certs, isNew }: FormProps) {
  const set = (patch: Obj) => onChange({ ...value, ...patch });
  const options = objs(value.options);
  const kind = value.kind === "multiple" ? "multiple" : "single";
  const source = (value.source as DocLink | undefined) ?? { title: "", url: "" };
  const setOption = (i: number, patch: Obj) => {
    let next = options.map((o, j) => (j === i ? { ...o, ...patch } : o));
    // A single-answer question has one correct option: picking one clears the others.
    if (kind === "single" && patch.correct === true) next = next.map((o, j) => ({ ...o, correct: j === i }));
    set({ options: next });
  };
  const relabel = (list: Obj[]) => list.map((o, j) => ({ ...o, id: LETTERS[j] }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <IdField value={str(value.id)} onChange={(id) => set({ id })} isNew={isNew} />
        <Field label="Answer type">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="single">Single answer</option>
              <option value="multiple">Multiple answers (2 or more correct)</option>
            </Select>
          )}
        </Field>
      </div>
      <CompetencyPicker label="Competencies" hint="What the question tests. The first one decides the cert." certs={certs} value={strs(value.competencies)} onChange={(competencies) => set({ competencies })} />
      <TextAreaField label="Question (Markdown)" hint="Inline code and fenced code blocks are allowed." rows={5} mono value={str(value.stem)} onChange={(stem) => set({ stem })} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Options (2 to 6)</legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-3 w-5 font-mono text-sm text-muted-foreground">{str(o.id) || LETTERS[i]}</span>
            <label className="mt-2.5 flex items-center gap-1.5 text-sm">
              <input type={kind === "single" ? "radio" : "checkbox"} name="correct-option" className="size-4" checked={o.correct === true} onChange={(e) => setOption(i, { correct: e.target.checked })} />
              Correct
            </label>
            <textarea
              aria-label={`Option ${LETTERS[i]}`}
              rows={1}
              className="min-h-11 flex-1 rounded-md border border-input bg-card px-3 py-2 text-[15px]"
              value={str(o.text)}
              onChange={(e) => setOption(i, { text: e.target.value })}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${LETTERS[i]}`} onClick={() => set({ options: relabel(options.filter((_, j) => j !== i)) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {options.length < 6 ? (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ options: relabel([...options, { text: "", correct: false }]) })}>
            <Plus /> Add option
          </Button>
        ) : null}
      </fieldset>
      <TextAreaField label="Explanation (Markdown)" hint="Shown after the answer: why the right option is right and the others are not." rows={4} value={str(value.explanation)} onChange={(explanation) => set({ explanation })} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Source title" value={source.title} onChange={(title) => set({ source: { ...source, title } })} />
        <TextField label="Source URL" placeholder="https://kubernetes.io/docs/…" value={source.url} onChange={(url) => set({ source: { ...source, url } })} />
      </div>
      {typeof value.knownIssue === "string" ? (
        <TextField label="Known issue" hint="While set, the question is left out of quizzes and listed in the flag queue. Clear it once fixed." value={value.knownIssue} onChange={(knownIssue) => set({ knownIssue: knownIssue || undefined })} />
      ) : null}
      <CheckboxField label="Sample content" hint={SAMPLE_HINT} checked={value.mock === true} onChange={(mock) => set({ mock })} />
    </div>
  );
}

/** Checks stay in YAML-like text: an assert tree or a script, which a form would only make harder to write. */
function ChecksField({ value, onChange, index }: { value: Obj[]; onChange: (v: Obj[]) => void; index: number }) {
  const set = (i: number, patch: Obj) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium">Checks</legend>
      {value.map((c, i) => {
        const isScript = typeof c.script === "string";
        return (
          <div key={i} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <TextField label="Check id" mono value={str(c.id)} onChange={(id) => set(i, { id })} />
              <TextField label="Passes when" hint="Written as the passing state." value={str(c.description)} onChange={(description) => set(i, { description })} />
              <Button type="button" variant="ghost" size="icon" className="mt-7" aria-label={`Remove check ${i + 1} of task ${index + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            <TextField label="Message when it fails (optional)" value={str(c.failMessage)} onChange={(failMessage) => set(i, { failMessage: failMessage || undefined })} />
            <div className="flex flex-wrap gap-4">
              <Field label="Kind">
                {(id) => (
                  <Select
                    id={id}
                    className="w-auto"
                    value={isScript ? "script" : "assert"}
                    onChange={(e) => (e.target.value === "script" ? set(i, { script: "", assert: undefined, namespace: undefined }) : set(i, { assert: {}, script: undefined, runIn: undefined }))}
                  >
                    <option value="assert">Chainsaw assert (resource state)</option>
                    <option value="script">Shell script (passes on exit 0)</option>
                  </Select>
                )}
              </Field>
              {isScript ? (
                <Field label="Runs in">
                  {(id) => (
                    <Select id={id} className="w-auto" value={str(c.runIn) || "grader"} onChange={(e) => set(i, { runIn: e.target.value })}>
                      <option value="grader">Grader (cluster-admin)</option>
                      <option value="workstation">Learner workstation (for files)</option>
                    </Select>
                  )}
                </Field>
              ) : (
                <TextField label="Namespace (optional)" mono value={str(c.namespace)} onChange={(namespace) => set(i, { namespace: namespace || undefined })} />
              )}
            </div>
            {isScript ? (
              <TextAreaField label="Script" mono rows={4} value={str(c.script)} onChange={(script) => set(i, { script })} />
            ) : (
              <JsonField label="Assert tree (JSON)" hint="The resource state to match, e.g. a Deployment with status.readyReplicas: 3. Easier to write in the Source view as YAML." value={(c.assert as Obj) ?? {}} onChange={(assert) => set(i, { assert })} />
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, { id: "", description: "", script: "" }])}>
        <Plus /> Add check
      </Button>
    </fieldset>
  );
}

/** A JSON object in a text box, applied when it parses. */
function JsonField({ label, hint, value, onChange }: { label: string; hint?: string; value: Obj; onChange: (v: Obj) => void }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          rows={6}
          spellCheck={false}
          className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm"
          defaultValue={JSON.stringify(value, null, 2)}
          onBlur={(e) => {
            try {
              const parsed: unknown = JSON.parse(e.target.value);
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                e.target.setCustomValidity("");
                onChange(parsed as Obj);
                return;
              }
              e.target.setCustomValidity("Must be a JSON object");
            } catch {
              e.target.setCustomValidity("Not valid JSON");
            }
            e.target.reportValidity();
          }}
        />
      )}
    </Field>
  );
}

export function LabForm({ value, onChange, certs, isNew, isMock }: FormProps & { isMock: boolean }) {
  const set = (patch: Obj) => onChange({ ...value, ...patch });
  const tasks = objs(value.tasks);
  const clusters = strs(value.clusters).length ? strs(value.clusters) : ["k8s"];
  const totalWeight = tasks.reduce((n, t) => n + (num(t.weight) ?? 0), 0);
  const setTask = (i: number, patch: Obj) => set({ tasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (i: number, by: number) => {
    const next = [...tasks];
    const [t] = next.splice(i, 1);
    next.splice(i + by, 0, t!);
    set({ tasks: next });
  };
  const mockCert = strs(value.competencies)[0]?.split("/")[0]?.toUpperCase();
  const taskCerts = isMock && mockCert ? certs.filter((c) => c.code === mockCert) : certs;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <IdField value={str(value.id)} onChange={(id) => set({ id })} isNew={isNew} />
        <NumberField label="Minutes" hint={isMock ? "The exam timer; at least 30." : "The session timer."} min={5} max={240} value={num(value.minutes)} onChange={(minutes) => set({ minutes })} />
        {isMock ? (
          <NumberField label="Pass mark (%)" hint="66 for CKA and CKAD, 67 for CKS." min={1} max={100} value={num(value.passPercent)} onChange={(passPercent) => set({ passPercent })} />
        ) : (
          <Field label="Tier" hint="Local Docker runs tier 1 (k3s).">
            {(id) => (
              <Select id={id} value={String(num(value.tier) ?? 1)} onChange={(e) => set({ tier: Number(e.target.value) })}>
                <option value="1">1: k3s cluster</option>
                <option value="2">2: kubeadm VMs</option>
                <option value="3">3: Linux VM</option>
              </Select>
            )}
          </Field>
        )}
      </div>
      <TextField label="Title" maxLength={120} value={str(value.title)} onChange={(title) => set({ title })} />
      <TextAreaField label="Summary" rows={2} value={str(value.summary)} onChange={(summary) => set({ summary })} />
      <CompetencyPicker label="Competencies" hint={isMock ? "The first one decides the cert; every task must test a competency of that cert." : "The first one decides the cert."} certs={certs} value={strs(value.competencies)} onChange={(competencies) => set({ competencies })} />
      <StringListField label="Clusters" hint="1 to 3 short names. Each is a kubectl context; with more than one, every task names its cluster." max={3} mono value={clusters} addLabel="Add cluster" onChange={(c) => set({ clusters: c })} />
      <StringListField label="Container images" hint="Preloaded into every cluster before the learner starts." mono value={strs(value.images)} addLabel="Add image" onChange={(images) => set({ images })} />
      <DocLinksField label="Docs" value={docs(value.docs)} onChange={(d) => set({ docs: d })} />
      <TextAreaField label="Setup script (optional)" hint="Runs once in the grader with cluster-admin before the terminal opens. Use kubectl --context <cluster>." mono rows={5} value={str(value.setup)} onChange={(setup) => set({ setup: setup || undefined })} />
      <TextAreaField label="Reference solution" hint="Runs in the workstation in the self-test; shown to the learner after the session." mono rows={6} value={str(value.solution)} onChange={(solution) => set({ solution })} />

      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="tasks-heading" className="text-lg font-semibold">
            Tasks
          </h2>
          <p className={totalWeight === 100 ? "text-sm text-success" : "text-sm font-medium text-warning"}>Weights add up to {totalWeight} of 100</p>
        </div>
        {tasks.map((t, i) => (
          <Card key={i} className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                Task {i + 1}
                {str(t.title) ? `: ${str(t.title)}` : ""}
              </h3>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move task ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move task ${i + 1} down`} disabled={i === tasks.length - 1} onClick={() => move(i, 1)}>
                  <ChevronDown />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove task ${i + 1}`} onClick={() => set({ tasks: tasks.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_7rem]">
              <TextField label="Task id" mono value={str(t.id)} onChange={(id) => setTask(i, { id })} />
              <TextField label="Task title" value={str(t.title)} onChange={(title) => setTask(i, { title })} />
              <NumberField label="Weight %" min={1} max={100} value={num(t.weight)} onChange={(weight) => setTask(i, { weight })} />
            </div>
            {clusters.length > 1 ? (
              <Field label="Cluster">
                {(id) => (
                  <Select id={id} value={str(t.cluster)} onChange={(e) => setTask(i, { cluster: e.target.value || undefined })}>
                    <option value="">Choose…</option>
                    {clusters.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <TextAreaField label="Task text (Markdown)" rows={5} value={str(t.body)} onChange={(body) => setTask(i, { body })} />
            {isMock ? (
              <>
                <CompetencyPicker
                  single
                  label="Competency tested"
                  hint="Groups the score per domain on the results page."
                  certs={taskCerts}
                  value={str(t.competency) ? [str(t.competency)] : []}
                  onChange={(v) => setTask(i, { competency: v[0] })}
                />
                <DocLinksField label="Doc page for a missed task" max={1} value={t.doc ? [t.doc as DocLink] : []} onChange={(d) => setTask(i, { doc: d[0] })} />
              </>
            ) : (
              <StringListField label="Hints" hint="Up to three, shown one at a time; using one is recorded." max={3} multiline value={strs(t.hints)} addLabel="Add hint" onChange={(hints) => setTask(i, { hints })} />
            )}
            <ChecksField index={i} value={objs(t.checks)} onChange={(checks) => setTask(i, { checks })} />
          </Card>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => set({ tasks: [...tasks, { id: `task-${tasks.length + 1}`, title: "", weight: Math.max(1, 100 - totalWeight), body: "", ...(isMock ? {} : { hints: [] }), checks: [{ id: `check-${tasks.length + 1}`, description: "", script: "" }] }] })}
        >
          <Plus /> Add task
        </Button>
        {isMock ? <FieldHint>A mock exam has at least 4 tasks, no hints, and a competency per task.</FieldHint> : null}
      </section>
      <CheckboxField label="Sample content" hint={SAMPLE_HINT} checked={value.mock === true} onChange={(mock) => set({ mock })} />
    </div>
  );
}
