import { createProcessor } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";

/**
 * Lesson MDX is evaluated on the server, so MDX written in the admin editor is held to a safe subset before it
 * is saved or rendered: Markdown, plus the lesson components (LESSON_COMPONENTS) with plain values as props.
 * No import/export, no {expressions} in the text, no other JSX tags (no <script>, no event handlers), and prop
 * expressions may only hold literals, such as steps={["Pod", "Service"]}.
 */

export const LESSON_COMPONENTS = ["Callout", "Flow", "Diagram", "KeyIdea", "DeepDive", "Example", "Trick"] as const;

interface Point {
  line?: number;
}
interface MdNode {
  type: string;
  name?: string | null;
  attributes?: MdAttr[];
  children?: MdNode[];
  position?: { start?: Point };
}
interface MdAttr {
  type: string;
  name?: string;
  value?: string | null | { type: string; value: string; data?: { estree?: EsNode } };
}
interface EsNode {
  type: string;
  [key: string]: unknown;
}

const LITERAL_NODES = new Set(["Program", "ExpressionStatement", "Literal", "ArrayExpression", "ObjectExpression", "Property", "TemplateLiteral", "TemplateElement", "UnaryExpression"]);

/** True when an estree holds nothing but literal values (strings, numbers, arrays and objects of them). */
function literalOnly(node: EsNode, parent?: EsNode, key?: string): boolean {
  if (node.type === "Identifier") {
    // Only as the key of a plain object property: { kind: "tip" }.
    return parent?.type === "Property" && key === "key" && parent.computed === false;
  }
  if (!LITERAL_NODES.has(node.type)) return false;
  if (node.type === "Property" && (node.computed || node.method || node.shorthand || node.kind !== "init")) return false;
  if (node.type === "TemplateLiteral" && Array.isArray(node.expressions) && node.expressions.length > 0) return false;
  if (node.type === "UnaryExpression" && node.operator !== "-") return false;
  if (node.type === "Literal" && "regex" in node && node.regex) return false;
  for (const [k, v] of Object.entries(node)) {
    if (k === "loc" || k === "range" || k === "comments") continue;
    const children = Array.isArray(v) ? v : [v];
    for (const c of children) {
      if (c && typeof c === "object" && typeof (c as EsNode).type === "string" && !literalOnly(c as EsNode, node, k)) return false;
    }
  }
  return true;
}

/** Problems that keep this MDX from being saved, each with its line; an empty list means it is safe to render. */
export function mdxProblems(source: string): string[] {
  let tree: MdNode;
  try {
    tree = createProcessor({ remarkPlugins: [remarkGfm] }).parse(source) as unknown as MdNode;
  } catch (err) {
    return [`body: MDX does not parse: ${(err as Error).message}`];
  }
  const problems: string[] = [];
  const at = (n: MdNode) => `body (line ${n.position?.start?.line ?? "?"})`;
  const visit = (n: MdNode) => {
    switch (n.type) {
      case "mdxjsEsm":
        problems.push(`${at(n)}: import and export are not allowed in lessons`);
        break;
      case "mdxFlowExpression":
      case "mdxTextExpression":
        problems.push(`${at(n)}: {expressions} are not allowed in lesson text; write \\{ for a literal brace`);
        break;
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement": {
        if (!n.name || !(LESSON_COMPONENTS as readonly string[]).includes(n.name)) {
          problems.push(`${at(n)}: <${n.name ?? ""}> is not allowed; lessons can use ${LESSON_COMPONENTS.map((c) => `<${c}>`).join(", ")}`);
          break;
        }
        for (const a of n.attributes ?? []) {
          if (a.type !== "mdxJsxAttribute") {
            problems.push(`${at(n)}: spread props are not allowed on <${n.name}>`);
          } else if (a.value && typeof a.value === "object") {
            const estree = a.value.data?.estree;
            if (!estree || !literalOnly(estree)) problems.push(`${at(n)}: the ${a.name} prop of <${n.name}> may only hold plain values, such as ["a", "b"]`);
          }
        }
        break;
      }
    }
    for (const c of n.children ?? []) visit(c);
  };
  visit(tree);
  return problems;
}
