import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/code-block";
import { rehypeHighlightPlugin } from "@/lib/highlight";

/** Markdown for question stems and explanations: no raw HTML, links open in a new tab, code highlighted. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`md-inline ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlightPlugin]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {c}
            </a>
          ),
          pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
