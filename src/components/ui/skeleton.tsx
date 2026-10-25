import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** Standard skeleton for card lists while day/dashboard data loads. */
export function TaskListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading tasks" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
        >
          <Skeleton className="size-5 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border bg-surface px-8 py-12 text-center">
      <div className="text-text-muted [&_svg]:size-7">{icon}</div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {description ? (
          <p className="max-w-sm text-xs leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
