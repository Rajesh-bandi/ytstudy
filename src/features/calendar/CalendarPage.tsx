import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from "lucide-react";
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

  const shift = (dir: number) => {
    setCursor((c) => {
      if (view === "week") return addDays(c, dir * 7);
      // Month arithmetic, not 28-day arithmetic: January 31 → February 1,
      // never "March 3".
      const next = new Date(c.getFullYear(), c.getMonth() + dir, 1);
      return next;
    });
  };

  const toggle = useCallback(
    async (task: ScheduledTask) => {
      if (task.status === "completed") await api.uncompleteTask(task.id);
      else await api.completeTask(task.id);
      await load();
    },
    [load],
  );

  const selectedPlan = selected ? plans.get(selected) : undefined;
  const monthDone = [...plans.values()].reduce(
    (sum, plan) => sum + plan.tasks.filter((t) => t.status === "completed").length,
    0,
  );
  const monthTotal = [...plans.values()].reduce((sum, plan) => sum + plan.tasks.length, 0);

  return (
    <>
      <TopBar
        title="Calendar"
        subtitle={`${format(cursor, "MMMM yyyy")} · ${monthDone}/${monthTotal} done in view`}
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {format(cursor, view === "week" ? "'Week of' MMM d" : "MMMM yyyy")}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <ModeToggle value={view} onChange={setView} />
                <Button variant="ghost" size="iconSm" onClick={() => shift(-1)} aria-label="Previous">
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => shift(1)} aria-label="Next">
                  <ChevronRight />
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setCursor(today());
                    setSelected(formatDateKey(today()));
                  }}
                >
                  Today
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-1.5 grid grid-cols-7 gap-1.5 pl-2 text-left">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d} className="micro text-[9px]">
                  {d}
                </span>
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
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{selected ? format(parseKey(selected), "EEEE, d MMMM") : ""}</CardTitle>
              {selectedPlan ? (
                <Badge
                  tone={
                    selectedPlan.tasks.length > 0 &&
                    selectedPlan.tasks.every((t) => t.status === "completed")
                      ? "success"
                      : "neutral"
                  }
                >
                  {selectedPlan.tasks.filter((t) => t.status === "completed").length}/
                  {selectedPlan.tasks.length}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {selectedPlan === undefined || selectedPlan.tasks.length === 0 ? (
              <EmptyState icon={<CalendarIcon />} title="No tasks on this day" />
            ) : (
              <div className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle">
                {selectedPlan.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} compact variant="row" onToggle={toggle} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
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
  const complete = total > 0 && done === total;

  return (
    <button
      onClick={onSelect}
      aria-label={`${format(date, "d MMMM yyyy")}${total ? `, ${done} of ${total} done` : ", no tasks"}`}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col gap-1 rounded-[4px] border p-2 text-left",
        "transition-[background-color,border-color,box-shadow] duration-(--duration-fast) ease-(--ease-out)",
        view === "month" ? "aspect-[4/3]" : "min-h-24 aspect-[4/3]",
        dim && !selected && "opacity-40",
        selected
          ? "border-accent/70 bg-accent-soft"
          : "border-border-subtle bg-surface-2/30 hover:border-border-strong hover:bg-surface-2/70",
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
        <span className="mt-auto flex flex-col gap-1">
          <span className="flex flex-wrap gap-[3px]">
            {plan!.tasks.slice(0, 10).map((t) => (
              <span
                key={t.id}
                className={cn(
                  "size-1.5 rounded-[1px] transition-colors",
                  t.status === "completed" ? "bg-success" : "bg-border-strong",
                )}
              />
            ))}
          </span>
          <span className="font-mono text-[9px] text-text-muted">
            {done}/{total}
          </span>
        </span>
      ) : null}
      {complete ? (
        <Check className="absolute right-1.5 top-1.5 size-3 text-success" aria-hidden />
      ) : null}
    </button>
  );
}

function ModeToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div className="panel-well flex items-center gap-0.5 rounded-[4px] p-0.5">
      {(["month", "week"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "rounded-[3px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-(--duration-fast)",
            value === v
              ? "bg-surface text-accent"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/* Monday-start helpers */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

function firstDayOfMonth(d: Date): Date {
  return startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
}

function daysInMonthGrid(d: Date): number {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return Math.ceil((last.getDate() + ((first.getDay() + 6) % 7)) / 7) * 7;
}
