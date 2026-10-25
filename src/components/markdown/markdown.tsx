import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { Mermaid } from "./mermaid";

/** Markdown for generated notes. Prose uses the sans face so long-form
 *  text stays readable inside a mono interface; code stays mono and
 *  ```mermaid fences become real diagrams. */
export const Markdown = memo(function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("md-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          // A mermaid fence renders its own figure; leaving it inside <pre>
          // would wrap the diagram in a code frame.
          pre: ({ node, children }) => {
            const first = (node as { children?: { properties?: { className?: unknown } }[] })
              ?.children?.[0];
            const classes = first?.properties?.className;
            if (Array.isArray(classes) && classes.includes("language-mermaid")) {
              return <>{children}</>;
            }
            return <pre>{children}</pre>;
          },
          code: ({ className, children, ...props }) => {
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (language === "mermaid") return <Mermaid code={String(children)} />;
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
