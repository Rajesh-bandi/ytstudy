import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTheme } from "@/app/providers/theme-provider";

/** Mermaid renders to a string; keep one global initialisation per theme
 *  instead of re-initialising for every diagram on screen. */
let readyTheme: string | null = null;

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    surface: v("--surface", "#282828"),
    surface2: v("--surface-2", "#32302f"),
    surface3: v("--surface-3", "#3c3836"),
    shade: v("--bg-shade", "#191b1c"),
    border: v("--border-strong", "#504945"),
    text: v("--text-primary", "#fbf1c7"),
    muted: v("--text-muted", "#928374"),
    accent: v("--accent", "#b8bb26"),
    amber: v("--gb-yellow", "#fabd2f"),
    font: v("--font-mono", "monospace"),
  };
}

/**
 * Diagrams inside notes. Mermaid is ~1MB, so it is imported lazily the first
 * time a note actually contains a diagram — never on app boot. A broken
 * diagram degrades to its source instead of taking the note down with it.
 */
export function Mermaid({ code }: { code: string }) {
  const { resolved } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    const paint = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const p = palette();
        const themeKey = `${resolved}:${p.accent}:${p.surface}`;
        if (readyTheme !== themeKey) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            fontFamily: p.font,
            themeVariables: {
              darkMode: resolved === "dark",
              background: "transparent",
              primaryColor: p.surface2,
              primaryTextColor: p.text,
              primaryBorderColor: p.border,
              secondaryColor: p.surface3,
              secondaryTextColor: p.text,
              secondaryBorderColor: p.border,
              tertiaryColor: p.shade,
              tertiaryTextColor: p.text,
              tertiaryBorderColor: p.border,
              lineColor: p.accent,
              textColor: p.text,
              mainBkg: p.surface2,
              nodeBorder: p.border,
              clusterBkg: p.shade,
              clusterBorder: p.border,
              edgeLabelBackground: p.surface,
              titleColor: p.text,
              fontSize: "12px",
            },
            flowchart: { curve: "basis", padding: 10, htmlLabels: true, useMaxWidth: true },
            sequence: { useMaxWidth: true, mirrorActors: false, messageFontSize: 11 },
          });
          readyTheme = themeKey;
        }

        const id = `mmd-${Date.now().toString(36)}-${seq.current++}`;
        const { svg } = await mermaid.render(id, code.trim());
        if (alive) {
          setSvg(svg);
          setFailed(null);
        }
      } catch (e) {
        if (alive) {
          setSvg(null);
          setFailed(e instanceof Error ? e.message : String(e));
        }
      }
    };
    void paint();
    return () => {
      alive = false;
    };
  }, [code, resolved]);

  if (failed) {
    return (
      <div className="my-3 overflow-hidden rounded-[3px] border border-warning/35 bg-warning-soft/40">
        <p className="flex items-center gap-1.5 border-b border-warning/25 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-warning">
          <AlertTriangle className="size-3" aria-hidden /> diagram could not render
        </p>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-text-secondary">
          {code}
        </pre>
      </div>
    );
  }

  const shell = "mermaid-figure my-3 overflow-x-auto rounded-[3px] border "
    + "border-border-subtle bg-bg-shade/45 px-3 py-3";

  if (!svg) {
    return (
      <div className={shell}>
        <div className="flex h-24 items-center justify-center text-[11px] text-text-muted">
          drawing diagram…
        </div>
      </div>
    );
  }

  return (
    <div
      ref={host}
      className={shell}
      // Mermaid output is generated locally from the note body with
      // securityLevel: "strict"; scripts and event handlers are stripped.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
