import "server-only";
import { evaluate } from "@mdx-js/mdx";
import { AlertTriangle, ArrowRight, Info, Lightbulb } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/code-block";
import { rehypeHighlightPlugin } from "@/lib/highlight";

/**
 * Renders a lesson's MDX body on the server. Lesson MDX comes only from content/ in this repository
 * (reviewed in pull requests and loaded by the ingest job), never from users, so evaluating it is safe.
 * Components available to lesson authors: <Callout kind title> and <Flow label steps>. Fenced code with a
 * language (```yaml, ```bash) is highlighted and gets a Copy button.
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

export async function LessonBody({ hash, source }: { hash: string; source: string }) {
  const Content = await compile(hash, source);
  return (
    <div className="prose-lesson">
      <Content components={{ Callout, Flow, a: Anchor, table: Table, pre: CodeBlock }} />
    </div>
  );
}
