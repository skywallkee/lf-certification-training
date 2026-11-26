import "server-only";
import { evaluate } from "@mdx-js/mdx";
import type { Diagrams } from "@lfct/curriculum";
import { AlertTriangle, ArrowRight, FlaskConical, Info, Lightbulb, Microscope, Sparkles, WandSparkles } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/code-block";
import { DiagramView } from "@/components/diagram";
import { rehypeHighlightPlugin } from "@/lib/highlight";
import { mdxProblems } from "@/lib/mdx-safety";

/**
 * Renders a lesson's MDX body on the server. Lesson MDX comes from content/ in this repository (reviewed in pull
 * requests and loaded by the ingest job) or from the admin editor, never from learners. MDX written in the editor
 * is checked against a safe subset (lib/mdx-safety.ts) when saved and again here before it is evaluated.
 * Components available to lesson authors (content/README.md, "Rich lessons"): <Callout kind title>, <Flow label steps>,
 * <Diagram id> (drawn from the front matter's diagrams), <KeyIdea>, <DeepDive title>, <Example title> and
 * <Trick title>. Fenced code with a language (```yaml, ```bash) is highlighted and gets a Copy button.
 */

function Callout({ kind = "note", title, children }: { kind?: "note" | "tip" | "warning"; title?: string; children: ReactNode }) {
  const styles = {
    note: { cls: "border-primary/40 bg-primary-soft", Icon: Info, word: "Note" },
    tip: { cls: "border-success/40 bg-success-soft", Icon: Lightbulb, word: "Tip" },
    warning: { cls: "border-warning/50 bg-warning-soft", Icon: AlertTriangle, word: "Warning" },
  }[kind];
  return (
    <aside className={`my-5 rounded-lg border p-4 ${styles.cls}`} aria-label={title ?? styles.word}>
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <styles.Icon aria-hidden="true" className="size-4" />
        {title ?? styles.word}
      </p>
      <div className="[&>p:last-child]:mb-0">{children}</div>
    </aside>
  );
}

/** A left-to-right flow diagram drawn as an ordered list, so screen readers read it as steps. */
function Flow({ label, steps }: { label: string; steps: string[] }) {
  return (
    <figure className="my-5">
      <ol aria-label={label} className="!m-0 !list-none !p-0 flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <li key={step} className="!m-0 flex items-center gap-2">
            <span className="rounded-md border border-input bg-card px-3 py-2 text-sm font-medium">{step}</span>
            {i < steps.length - 1 && <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />}
          </li>
        ))}
      </ol>
      <figcaption className="mt-2 text-sm text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** The one idea to remember from a section, in a sentence or two. */
function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside className="my-6 rounded-lg border-l-4 border-primary bg-primary-soft px-5 py-4 text-[17px] font-medium leading-relaxed" aria-label="Key idea">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles aria-hidden="true" className="size-4" />
        Key idea
      </p>
      <div className="[&>p:last-child]:mb-0">{children}</div>
    </aside>
  );
}

/** How or why it works underneath: folded away so the main line stays short, open for the curious. */
function DeepDive({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group my-6 rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
        <Microscope aria-hidden="true" className="size-4 text-primary" />
        <span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Under the hood · </span>
          {title}
        </span>
        <span aria-hidden="true" className="ml-auto text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t px-4 pb-1 pt-4 [&>*:last-child]:mb-3">{children}</div>
    </details>
  );
}

/** A worked example: a realistic task, then the steps and commands that solve it. */
function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="my-6 rounded-lg border border-success/40 bg-success-soft/60 p-4" aria-label={`Example: ${title}`}>
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <FlaskConical aria-hidden="true" className="size-4 text-success" />
        <span>
          <span className="text-xs font-semibold uppercase tracking-wide text-success">Example · </span>
          {title}
        </span>
      </p>
      <div className="[&>*:last-child]:mb-0">{children}</div>
    </section>
  );
}

/** A shortcut that saves time at the terminal or in the exam. */
function Trick({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="my-5 rounded-lg border border-warning/50 bg-warning-soft p-4" aria-label={`Trick: ${title}`}>
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <WandSparkles aria-hidden="true" className="size-4 text-warning" />
        <span>
          <span className="text-xs font-semibold uppercase tracking-wide text-warning">Trick · </span>
          {title}
        </span>
      </p>
      <div className="[&>*:last-child]:mb-0">{children}</div>
    </aside>
  );
}

function Anchor(props: ComponentProps<"a">) {
  const external = props.href?.startsWith("http");
  return <a {...props} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} />;
}

/** Wide tables and code scroll inside their own box, so the page never scrolls sideways on a phone. Focusable so keyboard users can scroll them. */
function Table(props: ComponentProps<"table">) {
  return (
    <div className="my-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
      <table {...props} />
    </div>
  );
}

const compiled = new Map<string, Promise<(props: { components: Record<string, unknown> }) => ReactNode>>();

async function compile(hash: string, source: string) {
  // Editor previews change with every keystroke: evaluate them without filling the cache.
  if (hash.startsWith("preview:")) {
    const m = await evaluate(source, { ...runtime, remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlightPlugin] });
    return m.default as unknown as (props: { components: Record<string, unknown> }) => ReactNode;
  }
  let entry = compiled.get(hash);
  if (!entry) {
    entry = evaluate(source, { ...runtime, remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlightPlugin] }).then(
      (m) => m.default as unknown as (props: { components: Record<string, unknown> }) => ReactNode,
    );
    compiled.set(hash, entry);
    entry.catch(() => compiled.delete(hash));
  }
  return entry;
}

export async function LessonBody({ hash, source, untrusted = false, diagrams = {} }: { hash: string; source: string; untrusted?: boolean; diagrams?: Diagrams }) {
  if (untrusted) {
    const problems = mdxProblems(source);
    if (problems.length > 0) {
      return (
        <p role="alert" className="text-destructive">
          This lesson cannot be shown: {problems[0]}
        </p>
      );
    }
  }
  const Content = await compile(hash, source);
  function Diagram({ id }: { id: string }) {
    const d = diagrams[id];
    if (!d) return <p role="alert" className="text-destructive">Diagram {id} is missing from the lesson.</p>;
    return <DiagramView diagram={d} />;
  }
  return (
    <div className="prose-lesson">
      <Content components={{ Callout, Flow, Diagram, KeyIdea, DeepDive, Example, Trick, a: Anchor, table: Table, pre: CodeBlock }} />
    </div>
  );
}
