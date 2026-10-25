import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Check, ExternalLink, Lock, RotateCcw } from "lucide-react";
import type { ScheduledTask } from "@/types";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { openExternal } from "@/lib/open-external";

export function TaskRow({
  task,
  onToggle,
  compact,
  variant = "card",
}: {
  task: ScheduledTask;
  onToggle: (task: ScheduledTask) => void;
  compact?: boolean;
  /** "row" joins a divided list; "card" stands alone in a column. */
  variant?: "card" | "row";
}) {
  const done = task.status === "completed";
  const locked = task.status === "locked";
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group rail relative flex items-center gap-3",
        "transition-[background-color,border-color,box-shadow,transform,opacity] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        compact ? "py-2" : "py-2.5",
        variant === "card" && "rounded-lg border px-3",
        variant === "row" && "rounded-md px-3 hover:bg-surface-2/70",
        done ? "opacity-60" : "",
        variant === "card" &&
          !done &&
          "border-border bg-surface shadow-sm hover:-translate-y-px hover:border-border-strong hover:bg-surface-2/40 hover:shadow-md",
        variant === "card" && done && "border-border-subtle bg-surface/60",
        variant === "card" && locked && "border-dashed",
      )}
    >
      {/* Completion checkbox: spring on tap, burst on check */}
      <Tooltip content={done ? "Mark as not done" : "Mark complete"}>
        <motion.button
          whileTap={{ scale: 0.82 }}
          whileHover={{ scale: 1.06 }}
          onClick={() => onToggle(task)}
          aria-label={done ? `Mark "${task.item_title}" not done` : `Complete "${task.item_title}"`}
          aria-checked={done}
          role="checkbox"
          className={cn(
            "relative flex size-[19px] shrink-0 items-center justify-center rounded-[5px] border",
            "transition-[background-color,border-color,box-shadow,color] duration-[var(--duration-fast)]",
            done
              ? "border-success/60 bg-success-soft text-success"
              : "border-border-strong text-transparent hover:border-accent hover:text-accent/70",
          )}
        >
          <AnimatePresence initial={false}>
            {done ? (
              <motion.span
                key="check"
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 620, damping: 24 }}
                className="flex"
              >
                <Check className="size-3.5" strokeWidth={3.2} />
              </motion.span>
            ) : null}
          </AnimatePresence>
          {done ? (
            <motion.span
              aria-hidden
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute inset-0 rounded-[5px] bg-success"
            />
          ) : null}
        </motion.button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        {/* The title is the door into the lesson workspace */}
        <Link
          to={`/learn/${task.item_id}`}
          className={cn(
            "block truncate text-[13px] leading-5 transition-colors hover:text-accent hover:underline underline-offset-2",
            done
              ? "text-text-muted line-through decoration-text-muted/40"
              : "text-text-primary",
          )}
        >
          {task.item_title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          {task.playlist_title ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background: (task.playlist_color ?? "var(--text-muted)")!,
                  boxShadow: `0 0 7px -1px ${(task.playlist_color ?? "transparent") as string}`,
                }}
              />
              <span className="truncate">{task.playlist_title}</span>
            </span>
          ) : null}
          {locked ? (
            <span className="flex items-center gap-1 text-[11px] text-info">
              <Lock className="size-3" aria-hidden /> in order
            </span>
          ) : null}
        </div>
      </div>

      {task.item_url ? <ButtonGhostExternal url={task.item_url} title={task.item_title} /> : null}
    </motion.article>
  );
}

function ButtonGhostExternal({ url, title }: { url: string; title: string }) {
  return (
    <Tooltip content="Open item" side="left">
      <button
        onClick={() => void openExternal(url)}
        aria-label={`Open ${title}`}
        className={cn(
          "rounded-md p-1.5 text-text-muted opacity-0",
          "transition-[opacity,background-color,color,transform] duration-[var(--duration-fast)]",
          "group-hover:opacity-100 hover:bg-accent-soft hover:text-accent active:scale-90",
          "focus-visible:opacity-100",
        )}
      >
        <ExternalLink className="size-3.5" />
      </button>
    </Tooltip>
  );
}

export function UncompleteHint({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip content="Undo completion">
      <button
        onClick={onClick}
        className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
        aria-label="Undo completion"
      >
        <RotateCcw className="size-3" />
      </button>
    </Tooltip>
  );
}
