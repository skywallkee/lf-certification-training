"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { convertItemAction, previewLessonAction, saveItemAction, type SaveState } from "@/app/actions/content";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { CertOption } from "./fields";
import { LabForm, LessonForm, QuestionForm, QuizMockForm } from "./item-forms";

type ItemType = "lesson" | "question" | "lab" | "mock" | "quiz-mock";
type View = "form" | "source" | "preview";

const SOURCE_HINT: Record<ItemType, string> = {
  lesson: "The lesson as its MDX file: YAML front matter, then the body. Same format as content/lessons.",
  question: "The question as a one-question bank file. Same format as content/questions.",
  lab: "The lab as its YAML file. Same format as content/labs (see content/README.md).",
  mock: "The mock exam as its YAML file. Same format as content/mocks (see content/README.md).",
  "quiz-mock": "The multiple-choice mock as its YAML file (format: multiple-choice). Same format as content/mocks (see content/README.md).",
};

/**
 * The editor for one item: a Form view, a Source view (the item in its file format, for fields the form does
 * not cover or a format change) and, for lessons, a Preview rendered exactly as learners see it. Saving
 * validates on the server and lists every problem by field.
 */
export function ContentEditor({
  type,
  originalId,
  initial,
  initialSource,
  certs,
}: {
  type: ItemType;
  originalId: string | null;
  initial: Record<string, unknown>;
  initialSource: string;
  certs: CertOption[];
}) {
  const [view, setView] = useState<View>("form");
  const [value, setValue] = useState(initial);
  const [source, setSource] = useState(initialSource);
  const [switchProblem, setSwitchProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ problems: string[]; node: ReactNode | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction, saving] = useActionState<SaveState, FormData>(saveItemAction, { problems: [] });

  const isNew = originalId === null;

  const go = (next: View) => {
    if (next === view) return;
    setSwitchProblem(null);
    startTransition(async () => {
      if (view === "form" && next !== "form") {
        const r = await convertItemAction(type, "source", JSON.stringify(value));
        if (!r.ok) return setSwitchProblem(r.problem);
        setSource(r.value);
      }
      if (view !== "form" && next === "form") {
        const r = await convertItemAction(type, "form", source);
        if (!r.ok) return setSwitchProblem(`The source does not parse, so the form cannot show it: ${r.problem}`);
        setValue(JSON.parse(r.value) as Record<string, unknown>);
      }
      if (next === "preview") {
        const lesson = view === "form" ? JSON.stringify(value) : await lessonOf(source);
        setPreview(await previewLessonAction(lesson));
      }
      setView(next);
    });
  };

  const lessonOf = async (src: string) => {
    const r = await convertItemAction(type, "form", src);
    return r.ok ? r.value : "{}";
  };

  const views: { key: View; label: string }[] = [
    { key: "form", label: "Form" },
    { key: "source", label: type === "lesson" ? "Source (MDX)" : "Source (YAML)" },
    ...(type === "lesson" ? [{ key: "preview" as const, label: "Preview" }] : []),
  ];
  const formProps = { value, onChange: setValue, certs, isNew };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // Submit without React's automatic form reset, which would put the selects back to their first option.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="originalId" value={originalId ?? ""} />
      <input type="hidden" name="mode" value={view === "form" ? "form" : "source"} />
      <input type="hidden" name="payload" value={view === "form" ? JSON.stringify(value) : source} />

      <div role="tablist" aria-label="Editor view" className="flex flex-wrap gap-1 border-b">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            id={`tab-${v.key}`}
            aria-selected={view === v.key}
            aria-controls="editor-panel"
            disabled={pending}
            onClick={() => go(v.key)}
            className={cn("-mb-px min-h-11 border-b-2 px-4 text-sm font-medium", view === v.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {v.label}
          </button>
        ))}
      </div>
      {switchProblem ? <FieldError>{switchProblem}</FieldError> : null}

      <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${view}`}>
        {view === "form" ? (
          type === "lesson" ? (
            <LessonForm {...formProps} />
          ) : type === "question" ? (
            <QuestionForm {...formProps} />
          ) : type === "quiz-mock" ? (
            <QuizMockForm {...formProps} />
          ) : (
            <LabForm {...formProps} isMock={type === "mock"} />
          )
        ) : view === "source" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source" className="text-sm font-medium">
              Source
            </label>
            <textarea
              id="source"
              rows={32}
              spellCheck={false}
              className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-[13px] leading-relaxed"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <FieldHint>{SOURCE_HINT[type]}</FieldHint>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-6">
            {preview?.problems.length ? (
              <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
                {preview.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              preview?.node
            )}
          </div>
        )}
      </div>

      {state.problems.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive-soft p-4">
          <p className="font-semibold text-destructive">Not saved: fix {state.problems.length === 1 ? "this problem" : `these ${state.problems.length} problems`}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={saving || pending}>
          {saving ? "Saving…" : isNew ? "Create draft" : "Save changes"}
        </Button>
        <FieldHint>{isNew ? "New items start as drafts: learners see them once you publish." : "Saved changes go live right away when the item is published."}</FieldHint>
      </div>
    </form>
  );
}
