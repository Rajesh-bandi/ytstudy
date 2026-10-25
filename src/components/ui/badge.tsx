import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";

type Tone = "neutral" | "accent" | "success" | "warning" | "info" | "danger" | "purple";

/* Chips carry a tinted fill, a 1px tinted rim and a colour-matched
   text weight — enough contrast on all six surfaces in both themes. */
const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-secondary border-border",
  accent: "bg-accent-soft text-accent border-accent/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  info: "bg-info-soft text-info border-info/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  purple: "bg-[color-mix(in_oklab,var(--rainbow-purple)_14%,transparent)] text-gb-purple border-gb-purple/25",
};

const fillGradient: Record<Tone, string> = {
  neutral: "linear-gradient(90deg, var(--text-muted), var(--text-secondary))",
  accent: "linear-gradient(90deg, var(--accent), var(--accent-strong))",
  success: "linear-gradient(90deg, color-mix(in oklab, var(--success) 75%, var(--gb-aqua)), var(--success))",
  warning: "linear-gradient(90deg, var(--accent), var(--warning))",
  info: "linear-gradient(90deg, color-mix(in oklab, var(--info) 70%, var(--gb-aqua)), var(--info))",
  danger: "linear-gradient(90deg, color-mix(in oklab, var(--danger) 70%, var(--warning)), var(--danger))",
  purple: "linear-gradient(90deg, var(--rainbow-blue), var(--rainbow-purple))",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        "transition-colors duration-[var(--duration-fast)]",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusDot({ status }: { status: TaskStatus }) {
  const color =
    status === "completed"
      ? "bg-success"
      : status === "locked"
        ? "bg-info"
        : status === "skipped"
          ? "bg-text-muted"
          : "bg-warning";
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      <span className={cn("size-2 rounded-full", color)} />
      {status === "pending" ? (
        <span className={cn("absolute inset-0 rounded-full opacity-60", color, "animate-ping")} />
      ) : null}
    </span>
  );
}

/** Progress track: a sunken well with a gradient fill, a lit leading
 *  edge and a slow travelling shine while the bar is partial. */
export function ProgressBar({
  value,
  className,
  tone = "accent",
  shine = true,
}: {
  value: number; // 0..1
  className?: string;
  tone?: Tone;
  shine?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const partial = pct > 0 && pct < 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "panel-well h-1.5 w-full overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className={cn(
          "relative h-full rounded-full",
          "transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]",
          shine && partial && "bar-shine",
        )}
        style={{
          width: `${pct}%`,
          background: fillGradient[tone],
          boxShadow: pct > 0 ? `0 0 10px -2px ${tone === "success" ? "var(--success)" : "var(--accent-glow)"}` : undefined,
        }}
      />
    </div>
  );
}

export function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        <span aria-hidden className="h-px w-4 bg-border-strong" />
        {title}
      </h2>
      {children}
    </div>
  );
}
