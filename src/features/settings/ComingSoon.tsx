import { NotebookPen, Sparkles } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Placeholder for a route whose feature lands in a later phase. It is
 *  deliberately not a skeleton: skeletons promise data is coming now. */
export default function NotesStub() {
  const preview = [
    "Graph traversal patterns, in the order I actually used them.",
    "Kadane's algorithm, a worked example, and the two ways it is asked.",
    "System design: read-heavy caching, from CDN to write-behind.",
  ];

  return (
    <>
      <TopBar title="Notes" subtitle="Arriving with the AI workspace phase" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 lg:p-6">
        <Card className="relative overflow-hidden p-8 text-center">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--accent) 40%, transparent), transparent 70%)",
            }}
          />
          <div className="relative flex flex-col items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
              <NotebookPen className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">
                Notes land with the AI workspace
              </h2>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-text-secondary">
                Markdown notes will be written per lesson, versioned on every regeneration, and kept
                beside the video you were watching. Nothing is lost when you ask for a rewrite.
              </p>
            </div>
            <Badge tone="accent">
              <Sparkles className="size-3" aria-hidden /> scheduled, not stubbed
            </Badge>
          </div>
        </Card>

        {/* What the editor will hold, shown as the design, not as filler */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
            <span className="size-2 rounded-full bg-danger/70" aria-hidden />
            <span className="size-2 rounded-full bg-warning/70" aria-hidden />
            <span className="size-2 rounded-full bg-success/70" aria-hidden />
            <span className="ml-2 text-[11px] text-text-muted">notes / graphs.md</span>
          </div>
          <div className="flex flex-col gap-2.5 px-5 py-4">
            {preview.map((line, i) => (
              <p key={line} className="flex gap-3 text-xs leading-relaxed text-text-secondary">
                <span className="numeric w-4 shrink-0 select-none text-right text-text-muted/70">
                  {i + 1}
                </span>
                {line}
              </p>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
