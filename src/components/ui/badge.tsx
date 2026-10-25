import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";

type Tone = "neutral" | "accent" | "success" | "warning" | "info" | "danger" | "purple";

/* Chips are small mono tags: a faint tint and a hairline, nothing louder. */
const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-secondary border-border",
  accent: "bg-accent-soft text-accent border-accent/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  info: "bg-info-soft text-info border-info/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  purple: "bg-[color-mix(in_oklab,var(--rainbow-purple)_12%,transparent)] text-gb-purple border-gb-purple/30",
};

const fillColor: Record<Tone, string> = {
  neutral: "var(--text-muted)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  info: "var(--info)",
  danger: "var(--danger)",
  purple: "var(--rainbow-purple)",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px",
        "font-mono text-[10px] font-medium leading-4 tracking-[0.03em]",
        "transition-colors duration-(--duration-fast)",
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
  return <span className={cn("size-1.5 shrink-0 rounded-full", color)} aria-hidden />;
}

/** Progress track: a sunken well and a flat fill in the tone's own colour. */
export function ProgressBar({
  value,
  className,
  tone = "accent",
}: {
  value: number; // 0..1
  className?: string;
  tone?: Tone;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-[2px] border border-border-subtle bg-bg-shade",
        className,
      )}
    >
      <div
        className="h-full rounded-[1px] transition-[width] duration-(--duration-slow) ease-(--ease-out)"
        style={{ width: `${pct}%`, background: fillColor[tone] }}
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
      <h2 className="micro flex items-center gap-2">
        <span aria-hidden className="h-px w-3 bg-border-strong" />
        {title}
      </h2>
      {children}
    </div>
  );
}
