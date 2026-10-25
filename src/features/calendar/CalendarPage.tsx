import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CircleCheck } from "lucide-react";
import { api } from "@/services/api";
import type { DayPlan, ScheduledTask } from "@/types";
import { addDays, formatDateKey, format, parseKey, today } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskRow } from "@/components/tasks/task-row";
import { EmptyState } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type View = "month" | "week";

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(today());
  const [plans, setPlans] = useState<Map<string, DayPlan>>(new Map());
  const [selected, setSelected] = useState<string | null>(formatDateKey(today()));

  const range = useMemo(() => {
    const start = view === "week" ? startOfWeek(cursor) : firstDayOfMonth(cursor);
    const days = view === "week" ? 7 : daysInMonthGrid(cursor);
    return Array.from({ length: days }, (_, i) => addDays(start, i));
  }, [cursor, view]);

  const load = useCallback(async () => {
    const start = formatDateKey(range[0]!);
    const end = formatDateKey(range[range.length - 1]!);
    const data = await api.getRangePlans(start, end);
    setPlans(new Map(data.map((p) => [p.date, p])));
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const shift = (dir: number) =>
    setCursor((c) => addDays(c, view === "week" ? dir * 7 : dir * 28));

  const selectedPlan = selected ? plans.get(selected) : undefined;

  return (
    <>
      <TopBar title="Calendar" subtitle="Full history and future schedule" />
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px] lg:p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {format(cursor, view === "week" ? "'Week of' MMM d, yyyy" : "MMMM yyyy")}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <ModeToggle value={view} onChange={setView} />
                <Button variant="ghost" size="iconSm" onClick={() => shift(-1)} aria-label="Previous">
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => shift(1)} aria-label="Next">
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-1.5 grid grid-cols-7 gap-1.5 pl-2 text-left text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {range.map((d) => (
                <DayCell
                  key={d.getTime()}
                  date={d}
                  view={view}
                  dim={view === "month" && d.getMonth() !== cursor.getMonth()}
                  plan={plans.get(formatDateKey(d))}
                  selected={selected === formatDateKey(d)}
                  onSelect={() => setSelected(formatDateKey(d))}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{selected ? format(parseKey(selected), "EEEE, d MMMM") : ""}</CardTitle>
              {selectedPlan ? (
                <Badge tone={selectedPlan.tasks.every((t) => t.status === "completed") && selectedPlan.tasks.length > 0 ? "success" : "neutral"}>
                  {selectedPlan.tasks.filter((t) => t.status === "completed").length}/{selectedPlan.tasks.length}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {selectedPlan === undefined || selectedPlan.tasks.length === 0 ? (
              <EmptyState icon={<CalendarIcon />} title="No tasks on this day" />
            ) : (
              <div className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-surface-2/25">
                {selectedPlan.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} compact variant="row" onToggle={toggleOf} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function toggleOf(task: ScheduledTask) {
  if (task.status === "completed") await api.uncompleteTask(task.id);
  else await api.completeTask(task.id);
  // light refresh trigger; the map reload happens on navigation
  window.dispatchEvent(new CustomEvent("foxstudy:refresh"));
}

function DayCell({
  date,
  view,
  dim,
  plan,
  selected,
  onSelect,
}: {
  date: Date;
  view: View;
  /** Belongs to the neighbouring month: kept, but quiet. */
  dim?: boolean;
  plan?: DayPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const isToday = formatDateKey(date) === formatDateKey(today());
  const done = plan?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const total = plan?.tasks.length ?? 0;
  return (
    <button
      onClick={onSelect}
      aria-label={`${format(date, "d MMMM yyyy")}${total ? `, ${done} of ${total} done` : ", no tasks"}`}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col gap-1 rounded-md border p-2 text-left",
        "transition-[background-color,border-color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        view === "month" ? "aspect-[4/3]" : "min-h-24 aspect-[4/3]",
        dim && !selected && "opacity-40 saturate-50",
        selected
          ? "border-accent/70 bg-accent-soft shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_32%,transparent)]"
          : "border-border-subtle bg-surface-2/40 hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span
        className={cn(
          "numeric text-[11px] leading-none",
          isToday
            ? "flex size-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-contrast"
            : selected
              ? "font-semibold text-text-primary"
              : "text-text-secondary",
        )}
      >
        {format(date, "d")}
      </span>
      {total > 0 ? (
        <span className="mt-auto flex flex-col gap-0.5">
          {fillDots(plan!.tasks.slice(0, 4))}
          {total > 4 ? <span className="text-[9px] text-text-muted">+{total - 4}</span> : null}
        </span>
      ) : null}
      {done > 0 && done === total ? (
        <CircleCheck
          className="absolute right-1.5 top-1.5 size-3 text-success"
          aria-hidden

        />
      ) : null}
    </button>
  );
}

function fillDots(tasks: ScheduledTask[]) {
  return (
    <span className="flex flex-wrap gap-[3px]">
      {tasks.map((t) => (
        <span
          key={t.id}
          className={cn(
            "size-1.5 rounded-full transition-colors",
            t.status === "completed" ? "bg-success" : "bg-border-strong/80",
          )}
          style={t.status === "completed" ? { boxShadow: "0 0 5px -1px var(--success)" } : undefined}
        />
      ))}
    </span>
  );
}

function ModeToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div className="panel-well flex items-center gap-0.5 rounded-md p-0.5">
      {(["month", "week"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "rounded-[4px] px-2.5 py-1 text-xs font-medium capitalize transition-colors duration-[var(--duration-fast)]",
            value === v
              ? "bg-surface text-accent shadow-sm"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/* Monday-start helpers (date-fs weekStartsOn local) */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

function firstDayOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(out);
}

function daysInMonthGrid(d: Date): number {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return Math.ceil((last.getDate() + ((first.getDay() + 6) % 7)) / 7) * 7;
}
