import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { api } from "@/services/api";
import type { AiConfig, PlanDiff, ScheduledTask } from "@/types";
import { addDays, format, formatDateKey, parseKey, today } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* The planner is a ledger, not a whiteboard: one row per lesson, grouped by
   the day it lands on, with the numbers that matter (difficulty, source,
   status). The companion can review the whole plan in one pass — strict
   courses stay fixed while flexible problem sets are ordered against each
   day's real load. */

type StatusFilter = "all" | "today" | "week" | "overdue" | "done";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";

const WINDOW = 7;

export default function Planner() {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [anchor, setAnchor] = useState(0);
  const [fullPlan, setFullPlan] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const load = useCallback(async () => {
    const start = formatDateKey(addDays(today(), -90));
    const end = formatDateKey(addDays(today(), 364));
    const [range, config] = await Promise.all([api.getRangePlans(start, end), api.getAiConfig()]);
    setTasks(range.flatMap((d) => d.tasks));
    setCfg(config);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayKey = formatDateKey(today());
  const aiReady = Boolean(cfg?.enabled && cfg.api_key.trim().length > 0);

  const toggle = useCallback(
    async (task: ScheduledTask) => {
      if (task.status === "completed") await api.uncompleteTask(task.id);
      else await api.completeTask(task.id);
      await load();
    },
    [load],
  );

  const move = useCallback(
    async (task: ScheduledTask, date: string) => {
      if (!date) return;
      try {
        await api.rescheduleTask(task.id, date);
        toast(`Moved to ${format(parseKey(date), "EEE d MMM")}.`, "success");
        await load();
      } catch (e) {
        toast(`Could not move the task: ${e}`, "error");
      }
    },
    [load],
  );

  const rebuild = useCallback(async () => {
    setBusy(true);
    try {
      const diff: PlanDiff = await api.rebuildSchedule();
      toast(
        diff.added + diff.moved > 0
          ? `Plan rebuilt — ${diff.added} scheduled, ${diff.moved} carried forward.`
          : "The plan is already up to date.",
        "success",
      );
      await load();
    } catch (e) {
      toast(`Rebuild failed: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const optimize = useCallback(async () => {
    if (!aiReady) {
      toast("Connect a provider in Settings → AI to optimize the plan.", "error");
      return;
    }
    setOptimizing(true);
    try {
      const result = await api.aiOptimizePlan();
      toast(
        result.moved > 0
          ? `Optimized ${result.playlists} flexible ${result.playlists === 1 ? "playlist" : "playlists"} — ${result.moved} items moved. ${result.note}`
          : result.note,
        "success",
      );
      await load();
    } catch (e) {
      toast(`Optimize failed: ${e}`, "error");
    } finally {
      setOptimizing(false);
    }
  }, [aiReady, load]);

  /* ------------------------------- derives ------------------------------- */

  const model = useMemo(() => {
    const all = tasks ?? [];
    const pending = all.filter((t) => t.status !== "completed");
    const overdue = pending
      .filter((t) => t.planned_date < todayKey)
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date));
    const upcoming = all.filter((t) => t.planned_date >= todayKey);
    const lastDate = upcoming.reduce(
      (max, t) => (t.planned_date > max ? t.planned_date : max),
      todayKey,
    );
    // The plan's own day 1: the earliest unfinished work, or today for a fresh
    // plan. Completed history does not stretch the numbering backwards.
    const planStart = pending.reduce(
      (min, t) => (t.planned_date < min ? t.planned_date : min),
      todayKey,
    );
    const planDays = Math.max(
      1,
      Math.round(
        (parseKey(lastDate).getTime() - parseKey(planStart).getTime()) / 86_400_000,
      ) + 1,
    );
    const dayIndex =
      Math.round((today().getTime() - parseKey(planStart).getTime()) / 86_400_000) + 1;
    const doneToday = all.filter(
      (t) => t.planned_date === todayKey && t.status === "completed",
    ).length;
    const plannedToday = all.filter((t) => t.planned_date === todayKey).length;
    return {
      all,
      overdue,
      lastDate,
      planStart,
      planDays,
      dayIndex: Math.max(1, dayIndex),
      doneToday,
      plannedToday,
      total: upcoming.length + overdue.length,
    };
  }, [tasks, todayKey]);

  const matches = useCallback(
    (t: ScheduledTask): boolean => {
      if (difficulty !== "all") {
        const d = t.item_difficulty ?? 3;
        if (difficulty === "easy" && d > 2) return false;
        if (difficulty === "medium" && d !== 3) return false;
        if (difficulty === "hard" && d < 4) return false;
      }
      switch (status) {
        case "today":
          return t.planned_date === todayKey;
        case "week": {
          const end = formatDateKey(addDays(today(), 6));
          return t.planned_date >= todayKey && t.planned_date <= end;
        }
        case "overdue":
          return t.planned_date < todayKey && t.status !== "completed";
        case "done":
          return t.status === "completed";
        default:
          // All = the live plan (today forward plus unfinished carry-over),
          // not months of completed history.
          return t.planned_date >= todayKey || t.status !== "completed";
      }
    },
    [difficulty, status, todayKey],
  );

  const days = useMemo(() => {
    const from = formatDateKey(addDays(today(), anchor));
    const to = formatDateKey(addDays(today(), anchor + WINDOW - 1));
    const grouped = new Map<string, ScheduledTask[]>();
    for (const t of model.all) {
      if (!matches(t)) continue;
      if (!fullPlan && status === "all" && (t.planned_date < from || t.planned_date > to)) {
        continue;
      }
      const list = grouped.get(t.planned_date) ?? [];
      list.push(t);
      grouped.set(t.planned_date, list);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        tasks: list.sort((a, b) => a.office_position - b.office_position),
        dayNumber:
          Math.round(
            (parseKey(date).getTime() - parseKey(model.planStart).getTime()) / 86_400_000,
          ) + 1,
      }));
  }, [model.all, model.planStart, matches, fullPlan, status, anchor]);

  const visibleCount = days.reduce((sum, d) => sum + d.tasks.length, 0);
  const doneInView = days.reduce(
    (sum, d) => sum + d.tasks.filter((t) => t.status === "completed").length,
    0,
  );

  /* -------------------------------- render ------------------------------- */

  return (
    <>
      <TopBar
        title="Planner"
        subtitle={
          tasks === null
            ? "Loading the plan"
            : `Day ${model.dayIndex} · ${model.doneToday}/${model.plannedToday} today · ${model.planDays} day plan · ends ${format(parseKey(model.lastDate), "d MMM")}`
        }
      />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-5 lg:p-7">
        <p className="lede max-w-3xl">
          Every playlist contributes its own daily target, so the plan mixes a strict course with a
          problem set without either flooding a day. Strict courses stay in sequence; flexible work
          is chosen to fit the load already on that day. Optimize asks the companion to review all
          of them together and re-order the flexible side day by day.
        </p>

        {/* ---------------------------- actions ---------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void optimize()} disabled={optimizing}>
            <Sparkles className={cn(optimizing && "animate-pulse")} />
            {optimizing ? "Reviewing the plan…" : "Optimize with AI"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void rebuild()} disabled={busy}>
            <RefreshCcw className={cn(busy && "animate-spin")} /> Rebuild plan
          </Button>
          {!aiReady ? (
            <Link
              to="/settings/ai"
              className="text-[11px] text-text-muted underline underline-offset-2 hover:text-accent"
            >
              connect a provider to optimize
            </Link>
          ) : (
            <span className="text-[11px] text-text-muted">
              {cfg?.model} · reviews {model.all.length} scheduled tasks
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="panel-well flex items-center gap-0.5 rounded-md p-0.5">
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Previous days"
                onClick={() => {
                  setFullPlan(false);
                  setAnchor((a) => a - WINDOW);
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Next days"
                onClick={() => {
                  setFullPlan(false);
                  setAnchor((a) => a + WINDOW);
                }}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button
              variant={fullPlan ? "primary" : "outline"}
              size="xs"
              onClick={() => {
                setFullPlan((v) => !v);
                setAnchor(0);
              }}
            >
              <CalendarClock /> {fullPlan ? "Full plan" : "Next 7 days"}
            </Button>
            {anchor !== 0 ? (
              <Button variant="ghost" size="xs" onClick={() => setAnchor(0)}>
                Today
              </Button>
            ) : null}
          </div>
        </div>

        {/* ---------------------------- overdue ---------------------------- */}
        {model.overdue.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/35 bg-warning-soft px-4 py-2.5">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            <p className="min-w-0 flex-1 text-[12px] text-text-secondary">
              <span className="numeric text-warning">{model.overdue.length}</span>{" "}
              {model.overdue.length === 1 ? "task is" : "tasks are"} waiting from earlier days —{" "}
              <span className="text-text-primary">
                {model.overdue
                  .slice(0, 3)
                  .map((t) => t.item_title)
                  .join(", ")}
                {model.overdue.length > 3 ? ` and ${model.overdue.length - 3} more` : ""}
              </span>
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setStatus((s) => (s === "overdue" ? "all" : "overdue"));
                setFullPlan(true);
              }}
            >
              {status === "overdue" ? "Hide them" : "Show them"}
            </Button>
            <Button variant="secondary" size="xs" onClick={() => void rebuild()} disabled={busy}>
              Carry forward
            </Button>
          </div>
        ) : null}

        {/* ---------------------------- filters ---------------------------- */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill
            active={status === "all"}
            onClick={() => setStatus("all")}
            label="All"
            count={model.total}
          />
          <FilterPill
            active={status === "today"}
            onClick={() => setStatus("today")}
            label="Today"
            count={model.plannedToday}
          />
          <FilterPill
            active={status === "week"}
            onClick={() => setStatus("week")}
            label="This week"
            count={model.all.filter(matchesWeek(todayKey)).length}
          />
          <FilterPill
            active={status === "overdue"}
            onClick={() => setStatus("overdue")}
            label="Overdue"
            count={model.overdue.length}
            tone="warning"
          />
          <FilterPill
            active={status === "done"}
            onClick={() => setStatus("done")}
            label="Done"
            count={model.all.filter((t) => t.status === "completed").length}
            tone="success"
          />

          <span aria-hidden className="mx-1 h-4 w-px bg-border" />

          <FilterPill
            active={difficulty === "all"}
            onClick={() => setDifficulty("all")}
            label="Any level"
          />
          <FilterPill
            active={difficulty === "easy"}
            onClick={() => setDifficulty("easy")}
            label="Easy"
            tone="info"
          />
          <FilterPill
            active={difficulty === "medium"}
            onClick={() => setDifficulty("medium")}
            label="Medium"
            tone="warning"
          />
          <FilterPill
            active={difficulty === "hard"}
            onClick={() => setDifficulty("hard")}
            label="Hard"
            tone="danger"
          />
        </div>

        {/* ----------------------------- legend ----------------------------- */}
        <div className="flex flex-wrap items-center gap-4 text-[10.5px] text-text-muted">
          <Legend color="var(--text-muted)" label="open" />
          <Legend color="var(--success)" label="done" />
          <Legend color="var(--warning)" label="carried forward" />
          <Legend color="var(--info)" label="pinned by you" />
          <span className="ml-auto numeric">
            {doneInView}/{visibleCount} in view
          </span>
        </div>

        {/* ------------------------------ days ------------------------------ */}
        {tasks === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-28 rounded-lg" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Nothing scheduled in this range"
            description={
              model.all.length === 0
                ? "Import a playlist and the planner fills the days for you."
                : "Try another window, clear the filters, or rebuild the plan."
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => void rebuild()} disabled={busy}>
                <RefreshCcw /> Rebuild plan
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {days.map(({ date, tasks: dayTasks, dayNumber }) => (
              <DaySection
                key={date}
                date={date}
                tasks={dayTasks}
                dayNumber={dayNumber}
                collapsed={Boolean(collapsed[date])}
                onToggleCollapse={() =>
                  setCollapsed((prev) => ({ ...prev, [date]: !prev[date] }))
                }
                onToggle={toggle}
                onMove={move}
              />
            ))}
          </div>
        )}

        <p className="pb-2 text-[10.5px] leading-relaxed text-text-muted">
          The horizon grows with the work: as long as items remain, the plan keeps adding days.
          Settings only sets the minimum window. Moving a task pins it; rebuilding leaves pinned
          work where you put it.
        </p>
      </div>
    </>
  );
}

/* ------------------------------- pieces -------------------------------- */

function matchesWeek(todayKey: string) {
  const end = formatDateKey(addDays(today(), 6));
  return (t: ScheduledTask) => t.planned_date >= todayKey && t.planned_date <= end;
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  tone = "accent",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tone?: "accent" | "warning" | "success" | "info" | "danger";
}) {
  const activeTone = {
    accent: "border-accent/50 bg-accent-soft text-accent",
    warning: "border-warning/45 bg-warning-soft text-warning",
    success: "border-success/40 bg-success-soft text-success",
    info: "border-info/40 bg-info-soft text-info",
    danger: "border-danger/40 bg-danger-soft text-danger",
  }[tone];
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? activeTone
          : "border-border text-text-secondary hover:border-border-strong hover:bg-surface-2",
      )}
    >
      {label}
      {count !== undefined ? (
        <span className={cn("numeric text-[10px]", active ? "opacity-90" : "text-text-muted")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function DaySection({
  date,
  tasks,
  dayNumber,
  collapsed,
  onToggleCollapse,
  onToggle,
  onMove,
}: {
  date: string;
  tasks: ScheduledTask[];
  dayNumber: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggle: (t: ScheduledTask) => void;
  onMove: (t: ScheduledTask, date: string) => void;
}) {
  const done = tasks.filter((t) => t.status === "completed").length;
  const isToday = date === formatDateKey(today());
  const isPast = date < formatDateKey(today());

  return (
    <Card className={cn("overflow-hidden", isToday && "border-accent/45")}>
      <button
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className={cn(
          "flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5 text-left transition-colors hover:bg-surface-2/40",
          collapsed ? "border-transparent" : "border-border-subtle",
        )}
      >
        <span className="micro text-[9px]">Day {dayNumber}</span>
        <span
          className={cn(
            "numeric text-[13px] font-medium",
            isToday ? "text-accent" : isPast ? "text-text-secondary" : "text-text-primary",
          )}
        >
          {format(parseKey(date), "EEE d MMM")}
        </span>
        {isToday ? <Badge tone="accent">today</Badge> : null}
        {isPast && !isToday ? <span className="micro text-[9px]">past</span> : null}
        <span className="ml-auto flex items-center gap-2.5">
          <DashMeter value={done} total={tasks.length} />
          <span className="numeric text-[10.5px] text-text-muted">
            {done}/{tasks.length} done
          </span>
          {tasks.some((t) => t.locked) ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-info">
              <Lock className="size-3" /> pinned
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 text-text-muted transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border-subtle/70">
              {tasks.map((t, i) => (
                <PlanRow
                  key={t.id}
                  task={t}
                  index={i + 1}
                  onToggle={onToggle}
                  onMove={onMove}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function PlanRow({
  task,
  index,
  onToggle,
  onMove,
}: {
  task: ScheduledTask;
  index: number;
  onToggle: (t: ScheduledTask) => void;
  onMove: (t: ScheduledTask, date: string) => void;
}) {
  const done = task.status === "completed";
  const overdue = !done && task.planned_date < formatDateKey(today());
  const difficulty = task.item_difficulty;

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors",
        "hover:bg-surface-2/35",
      )}
    >
      <button
        onClick={() => onToggle(task)}
        aria-label={done ? `Reopen ${task.item_title}` : `Complete ${task.item_title}`}
        aria-pressed={done}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          done
            ? "border-success/70 bg-success-soft text-success"
            : "border-border-strong text-transparent hover:border-accent hover:text-accent/70",
        )}
      >
        <Check className="size-3" />
      </button>

      <span className="numeric w-5 shrink-0 text-right text-[10.5px] text-text-muted/70">
        {index}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            to={`/learn/${task.item_id}`}
            className={cn(
              "min-w-0 truncate text-[12.5px] leading-snug transition-colors hover:text-accent",
              done ? "text-text-muted line-through decoration-text-muted/40" : "text-text-primary",
            )}
            title={task.item_title}
          >
            {task.item_title}
          </Link>
          {difficulty !== null ? (
            <Badge
              tone={difficulty <= 2 ? "success" : difficulty === 3 ? "warning" : "danger"}
              className="shrink-0"
            >
              {difficulty <= 2 ? "Easy" : difficulty === 3 ? "Medium" : "Hard"}
            </Badge>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-[10px] text-text-muted">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: task.playlist_color ?? "var(--text-muted)" }}
            />
            <span className="max-w-[160px] truncate">{task.playlist_title}</span>
          </span>
          {task.item_topic ? (
            <span className="hidden text-[10px] text-text-muted/80 sm:inline">
              {task.item_topic}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          {done ? (
            <span className="text-success">completed</span>
          ) : overdue ? (
            <span className="text-warning">carried forward</span>
          ) : (
            <span>planned</span>
          )}
          {task.locked ? (
            <span className="inline-flex items-center gap-1 text-info">
              <Lock className="size-2.5" /> pinned
            </span>
          ) : null}
          <span className="uppercase tracking-[0.1em] text-text-muted/60">
            {task.playlist_policy}
          </span>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <MoveSelect task={task} onMove={onMove} />
        <Link
          to={`/learn/${task.item_id}`}
          aria-label="Open lesson"
          title="Open lesson"
          className="inline-flex size-6 items-center justify-center rounded-[2px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <ExternalLink className="size-3.5" />
        </Link>
        <Button
          variant={done ? "ghost" : "secondary"}
          size="xs"
          onClick={() => onToggle(task)}
          className="min-w-[62px]"
        >
          {done ? "Undo" : "Done"}
        </Button>
      </div>
    </div>
  );
}

/** Segmented day meter: one tick per task, filled ticks are done. Reads like
 *  a progress track of squares rather than a single bar, so a half-finished
 *  day is obvious at a glance. */
function DashMeter({ value, total }: { value: number; total: number }) {
  const seg = Math.min(total, 24);
  const filled = Math.round((value / Math.max(1, total)) * seg);
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {Array.from({ length: seg }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-[7px] w-[7px] rounded-[1px] transition-colors duration-[var(--duration-base)]",
            i < filled ? "bg-success" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/** Date control for a plan row: a locale-stable list of dates instead of the
 *  platform's numeric date field, which reads 18/23/2026 in some locales. */
function MoveSelect({
  task,
  onMove,
}: {
  task: ScheduledTask;
  onMove: (t: ScheduledTask, date: string) => void;
}) {
  const options = useMemo(() => {
    const keys: string[] = [];
    for (let i = -30; i <= 60; i++) keys.push(formatDateKey(addDays(today(), i)));
    if (!keys.includes(task.planned_date)) keys.push(task.planned_date);
    return [...new Set(keys)].sort();
  }, [task.planned_date]);

  return (
    <select
      value={task.planned_date}
      aria-label={`Move ${task.item_title} to another day`}
      onChange={(e) => {
        if (e.target.value !== task.planned_date) onMove(task, e.target.value);
      }}
      className={cn(
        "h-6 cursor-pointer rounded-[3px] border border-transparent bg-transparent px-1.5 text-[10.5px]",
        "text-text-muted transition-colors hover:border-border hover:text-text-secondary",
        "focus-visible:border-border-focus focus-visible:text-text-primary focus-visible:outline-none",
      )}
    >
      {options.map((k) => (
        <option key={k} value={k} className="bg-surface text-text-primary">
          {format(parseKey(k), "d MMM")}
        </option>
      ))}
    </select>
  );
}
