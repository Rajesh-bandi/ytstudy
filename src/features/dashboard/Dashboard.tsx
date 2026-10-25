import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleCheck,
  Flame,
  ListVideo,
  Minus,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
  Zap,
} from "lucide-react";
import { api } from "@/services/api";
import type {
  CompanionSkin,
  DashboardData,
  DayCompletion,
  DayPlan,
  ScheduledTask,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { addDays, formatDateKey, format, today } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar } from "@/components/ui/badge";
import { TaskListSkeleton, EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { TaskRow } from "@/components/tasks/task-row";
import { Character, type CompanionState } from "@/components/companion/companion";
import { openCompanion } from "@/components/companion/bus";
import { cn } from "@/lib/utils";

const WEEK_WINDOW = 14;

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [heat, setHeat] = useState<DayCompletion[] | null>(null);
  const [week, setWeek] = useState<DayPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [buddy, setBuddy] = useState({
    name: DEFAULT_SETTINGS.companion_name,
    skin: DEFAULT_SETTINGS.companion_skin as CompanionSkin,
  });

  useEffect(() => {
    void api
      .getAiConfig()
      .then((c) => setAiReady(c.enabled && c.api_key.trim().length > 0))
      .catch(() => setAiReady(false));
    void api
      .getSettings()
      .then((s) =>
        setBuddy({
          name: s.companion_name?.trim() || DEFAULT_SETTINGS.companion_name,
          skin: (s.companion_skin as CompanionSkin) ?? DEFAULT_SETTINGS.companion_skin,
        }),
      )
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const start = formatDateKey(today());
      const end = formatDateKey(addDays(today(), 6));
      const [dash, heatmap, range] = await Promise.allSettled([
        api.getDashboard(),
        api.getHeatmap(WEEK_WINDOW),
        api.getRangePlans(start, end),
      ]);
      if (dash.status === "rejected") throw dash.reason;
      setData(dash.value);
      setHeat(heatmap.status === "fulfilled" ? heatmap.value.days : null);
      setWeek(range.status === "fulfilled" ? range.value : null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (task: ScheduledTask) => {
      if (!data) return;
      const willComplete = task.status !== "completed";
      // Optimistic: the checkbox answers instantly, the backend catches up.
      setData(applyToggle(data, task, willComplete));
      try {
        if (willComplete) {
          await api.completeTask(task.id);
          toast(`"${trim(task.item_title)}" completed.`, "success");
        } else {
          await api.uncompleteTask(task.id);
        }
        await load();
      } catch (e) {
        setError(String(e));
        await load();
      }
    },
    [data, load],
  );

  const companionState: CompanionState =
    data == null
      ? "idle"
      : data.all_done && data.planned_today > 0
        ? "celebrating"
        : data.streak.current_streak === 0
          ? "encouraging"
          : data.completed_today > 0
            ? "focused"
            : "idle";

  const doneToday = data?.completed_today ?? 0;
  const plannedToday = data?.planned_today ?? 0;
  const remaining = Math.max(0, plannedToday - doneToday);
  const nextTask = data?.today.tasks.find((t) => t.status !== "completed") ?? null;

  const subtitle = data
    ? `${format(today(), "EEEE, d MMMM")} · ${doneToday}/${plannedToday} done`
    : format(today(), "EEEE, d MMMM yyyy");

  return (
    <>
      <TopBar title="Today" subtitle={subtitle} />
      <div className="flex flex-col gap-4 p-5 lg:p-6">
        <SummaryStrip
          streak={data?.streak}
          weekly={data?.weekly_completions}
          done={doneToday}
          planned={plannedToday}
          next={nextTask}
        />

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          {/* ---- Queue, then the week and yesterday -------------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="overflow-hidden">
              <div className="h-[2px] w-full bg-surface-2">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{
                    width: plannedToday > 0 ? `${(doneToday / plannedToday) * 100}%` : "0%",
                  }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="micro">the queue</p>
                    <CardTitle className="mt-1 text-[15px]">Today's tasks</CardTitle>
                  </div>
                  <div className="flex items-end gap-4">
                    {data && plannedToday > 0 ? (
                      <div className="flex items-center gap-1" aria-hidden>
                        {Array.from({ length: Math.min(plannedToday, 12) }).map((_, i) => (
                          <motion.span
                            key={i}
                            initial={false}
                            animate={{
                              backgroundColor:
                                i < doneToday ? "var(--accent)" : "var(--surface-3)",
                            }}
                            transition={{ duration: 0.24, delay: i * 0.02 }}
                            className="h-1.5 w-3 rounded-[1px]"
                          />
                        ))}
                        {plannedToday > 12 ? (
                          <span className="numeric text-[9.5px] text-text-muted">
                            +{plannedToday - 12}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="text-right">
                      <p className="numeric text-[20px] font-semibold leading-none">
                        <span className="text-accent">{doneToday}</span>
                        <span className="mx-0.5 text-text-muted/70">/</span>
                        <span className="text-text-primary">{plannedToday}</span>
                      </p>
                      <p className="micro mt-1">{remaining} left</p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {error ? (
                  <EmptyState
                    icon={<Zap />}
                    title="Couldn't reach the app backend"
                    description={error}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => void load()}>
                        Retry
                      </Button>
                    }
                  />
                ) : data === null ? (
                  <TaskListSkeleton rows={4} />
                ) : data.today.tasks.length === 0 ? (
                  <EmptyState
                    icon={<Sunrise />}
                    title="Nothing scheduled today"
                    description="Import a playlist and the planner fills today's queue automatically — one target per playlist, carried forward if you miss a day."
                    action={
                      <Link to="/playlists">
                        <Button variant="primary" size="sm">
                          <ListVideo /> Add a playlist
                        </Button>
                      </Link>
                    }
                  />
                ) : (
                  <div className="stagger divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle">
                    {data.today.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} onToggle={toggle} variant="row" />
                    ))}
                  </div>
                )}

                {data && data.today.tasks.length > 0 ? (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-2.5">
                    <span className="micro flex min-w-0 items-center gap-1.5">
                      <BookOpen className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {nextTask ? nextTask.item_title : "Day complete"}
                      </span>
                    </span>
                    <Link
                      to="/planner"
                      className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-text-muted transition-colors hover:text-accent"
                    >
                      planner <ArrowUpRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <WeekAhead days={week} />
              <YesterdayCard day={data?.yesterday} />
            </div>
          </div>

          {/* ---- Momentum, companion, doors ---------------------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <MomentumCard streak={data?.streak} heat={heat} />
            <CompanionCard
              name={buddy.name}
              skin={buddy.skin}
              state={companionState}
              aiReady={aiReady}
              remaining={remaining}
              planned={plannedToday}
            />
            <QuickActions />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- summary */

function SummaryStrip({
  streak,
  weekly,
  done,
  planned,
  next,
}: {
  streak?: DashboardData["streak"];
  weekly?: number;
  done: number;
  planned: number;
  next: ScheduledTask | null;
}) {
  const week = weekly ?? 0;
  const perDay = Math.round((week / 7) * 10) / 10;
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <BriefCell label="today" icon={CircleCheck}>
          <div className="flex items-baseline gap-1.5">
            <span className="numeric text-[24px] font-semibold leading-none text-text-primary">
              {done}
              <span className="text-[13px] font-normal text-text-muted">/{planned}</span>
            </span>
          </div>
          <ProgressBar
            value={planned > 0 ? done / planned : 0}
            className="mt-2.5 h-1"
            tone={planned > 0 && done === planned ? "success" : "accent"}
          />
        </BriefCell>

        <BriefCell label="streak" icon={Flame} accent>
          <div className="flex items-baseline gap-1.5">
            <span className="numeric text-[24px] font-semibold leading-none text-accent">
              {streak?.current_streak ?? 0}
            </span>
            <span className="text-[11px] text-text-muted">days</span>
          </div>
          <p className="micro mt-2">best {streak?.best_streak ?? 0}</p>
        </BriefCell>

        <BriefCell label="this week" icon={Zap}>
          <div className="flex items-baseline gap-1.5">
            <span className="numeric text-[24px] font-semibold leading-none text-text-primary">
              {week}
            </span>
            <span className="text-[11px] text-text-muted">done</span>
          </div>
          <p className="micro mt-2">{perDay}/day average</p>
        </BriefCell>

        <BriefCell label="next up" icon={BookOpen}>
          <p className="truncate text-[12px] leading-snug text-text-primary">
            {next?.item_title ?? "Queue clear"}
          </p>
          <p className="micro mt-2 truncate">
            {next?.playlist_title ?? (planned > 0 ? "everything done" : "nothing scheduled")}
          </p>
        </BriefCell>
      </div>
    </Card>
  );
}

function BriefCell({
  label,
  icon: Icon,
  accent,
  children,
}: {
  label: string;
  icon: typeof Flame;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface p-3.5">
      <p className={cn("micro flex items-center gap-1.5", accent && "text-text-secondary")}>
        <Icon className={cn("size-3", accent ? "text-accent" : "text-text-muted")} aria-hidden />
        {label}
      </p>
      <div className="mt-1.5 min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ the week */

function WeekAhead({ days }: { days: DayPlan[] | null }) {
  const cells = useMemo(() => {
    const byDate = new Map((days ?? []).map((d) => [d.date, d]));
    const start = today();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const key = formatDateKey(date);
      const plan = byDate.get(key);
      const tasks = plan?.tasks ?? [];
      return {
        key,
        date,
        total: tasks.length,
        done: tasks.filter((t) => t.status === "completed").length,
        today: i === 0,
      };
    });
  }, [days]);

  const max = Math.max(1, ...cells.map((c) => c.total));
  const total = cells.reduce((sum, c) => sum + c.total, 0);
  const done = cells.reduce((sum, c) => sum + c.done, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Week ahead</CardTitle>
          <Link
            to="/planner"
            className="font-mono text-[10px] text-text-muted underline underline-offset-2 transition-colors hover:text-accent"
          >
            open
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex h-[92px] items-end gap-1.5">
          {cells.map((c, i) => (
            <div key={c.key} className="group flex h-full flex-1 flex-col justify-end gap-1">
              <span className="text-center font-mono text-[8.5px] leading-none text-text-muted">
                {c.total || ""}
              </span>
              <motion.div
                initial={{ height: 2 }}
                animate={{ height: `${Math.max(4, (c.total / max) * 100)}%` }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                title={`${format(c.date, "EEE d MMM")}: ${c.done}/${c.total} done`}
                className={cn(
                  "w-full rounded-[2px]",
                  c.today
                    ? "bg-accent"
                    : c.total > 0
                      ? "bg-[color-mix(in_oklab,var(--accent)_45%,var(--surface-3))] group-hover:bg-accent/80"
                      : "bg-surface-3",
                )}
              />
              <span
                className={cn(
                  "text-center font-mono text-[8.5px] leading-none",
                  c.today ? "text-accent" : "text-text-muted",
                )}
              >
                {format(c.date, "EEEEE")}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <span className="micro">next 7 days</span>
          <span className="numeric text-[10.5px] text-text-muted">
            {done}/{total} done
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- yesterday */

function YesterdayCard({ day }: { day?: DayPlan }) {
  if (!day) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Yesterday</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="skeleton block h-20" />
        </CardContent>
      </Card>
    );
  }

  const done = day.tasks.filter((t) => t.status === "completed").length;
  const planned = day.tasks.length;
  const kept = planned > 0 && done === planned;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="micro">yesterday</p>
            <CardTitle className="mt-1 flex items-baseline gap-2">
              {format(new Date(`${day.date}T12:00:00`), "EEE d MMM")}
              {planned === 0 ? (
                <Badge tone="neutral">empty</Badge>
              ) : (
                <Badge tone={kept ? "success" : done > 0 ? "accent" : "neutral"}>
                  {done}/{planned}
                </Badge>
              )}
            </CardTitle>
          </div>
          {planned > 0 ? (
            <ProgressBar value={done / planned} tone={kept ? "success" : "accent"} className="w-16" />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {planned === 0 ? (
          <p className="text-[11px] leading-relaxed text-text-muted">
            No plan for yesterday, so nothing was lost. Today picks up where the playlist left off.
          </p>
        ) : (
          <ul className="flex flex-col">
            {day.tasks.slice(0, 4).map((t, i) => {
              const complete = t.status === "completed";
              return (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.22 }}
                  className={cn(
                    "flex items-center gap-2 py-1.5 text-[11.5px]",
                    i > 0 && "border-t border-border-subtle/70",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      complete
                        ? "border-transparent bg-success/85 text-text-inverted"
                        : "border-border-strong text-text-muted",
                    )}
                  >
                    {complete ? (
                      <Check className="size-2.5" strokeWidth={3.4} />
                    ) : (
                      <Minus className="size-2.5" strokeWidth={3} />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      complete
                        ? "text-text-muted line-through decoration-text-muted/40"
                        : "text-text-secondary",
                    )}
                  >
                    {t.item_title}
                  </span>
                  <span className="max-w-[72px] shrink-0 truncate font-mono text-[9px] text-text-muted">
                    {t.playlist_title}
                  </span>
                </motion.li>
              );
            })}
            {day.tasks.length > 4 ? (
              <li className="border-t border-border-subtle/70 pt-1.5 font-mono text-[9.5px] text-text-muted">
                +{day.tasks.length - 4} more
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ momentum */

function MomentumCard({
  streak,
  heat,
}: {
  streak?: DashboardData["streak"];
  heat: DayCompletion[] | null;
}) {
  const days = heat ?? [];
  const active = days.filter((d) => d.completed > 0).length;
  const max = Math.max(1, ...days.map((d) => d.completed));

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="micro">momentum</p>
            <CardTitle className="mt-1">Current streak</CardTitle>
          </div>
          {streak && streak.current_streak === 0 ? (
            <Badge tone="neutral">start today</Badge>
          ) : (
            <Flame className="size-4 text-streak" aria-hidden />
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {streak === undefined ? (
          <>
            <span className="skeleton h-14" />
            <span className="skeleton h-8" />
          </>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <motion.span
                  key={streak.current_streak}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className={cn(
                    "numeric text-[44px] font-bold leading-none tracking-[-0.04em]",
                    streak.current_streak > 0 ? "text-accent" : "text-text-primary",
                  )}
                >
                  {streak.current_streak}
                </motion.span>
                <span className="pb-1 text-[11px] text-text-muted">
                  day{streak.current_streak === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 pb-1">
                <span className="micro">best</span>
                <span className="numeric text-[15px] font-semibold text-text-secondary">
                  {streak.best_streak}
                </span>
              </div>
            </div>

            {/* Fourteen days, one bar each: the shape of the habit */}
            <div className="flex h-12 items-end gap-[3px]" aria-hidden>
              {(heat === null ? Array.from({ length: 14 }, () => null) : days).map(
                (d, i) =>
                  d === null ? (
                    <span key={i} className="skeleton h-full flex-1 rounded-[1px]" />
                  ) : (
                    <motion.span
                      key={d.date}
                      initial={{ height: 2 }}
                      animate={{ height: `${Math.max(6, (d.completed / max) * 100)}%` }}
                      transition={{ delay: i * 0.02, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      title={`${format(new Date(`${d.date}T12:00:00`), "d MMM")}: ${d.completed} completed`}
                      className={cn(
                        "flex-1 rounded-[1px]",
                        d.completed > 0 ? "bg-accent/85" : "bg-surface-3",
                      )}
                    />
                  ),
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
              <span className="micro">active {active}/14</span>
              <span className="micro">{streak.qualifying_days_total} qualifying days</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- companion */

function CompanionCard({
  name,
  skin,
  state,
  aiReady,
  remaining,
  planned,
}: {
  name: string;
  skin: CompanionSkin;
  state: CompanionState;
  aiReady: boolean;
  remaining: number;
  planned: number;
}) {
  const line =
    state === "celebrating"
      ? "Day cleared. Streak preserved — rest is part of the plan."
      : planned === 0
        ? "Nothing queued yet. Import a playlist and the planner builds the week."
        : state === "encouraging"
          ? "Pick the smallest task first. Momentum is easier to borrow than build."
          : `${remaining} left today. Start with the shortest one.`;

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{name}</CardTitle>
          <span
            className={cn(
              "flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em]",
              aiReady ? "text-accent" : "text-text-muted",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", aiReady ? "bg-accent" : "bg-text-muted")}
              aria-hidden
            />
            {aiReady ? "connected" : "offline"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3 pt-2">
        <Character mood={state} skin={skin} size={56} name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-relaxed text-text-secondary">{line}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="xs" variant="primary" onClick={openCompanion}>
              <Sparkles /> Ask
            </Button>
            <Link
              to={aiReady ? "/settings" : "/settings/ai"}
              className="font-mono text-[9.5px] text-text-muted underline underline-offset-2 transition-colors hover:text-accent"
            >
              {aiReady ? "character" : "connect AI"}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------- quick actions */

type Door = { to: string; label: string; hint: string; icon: typeof Flame; tint: string };

const doors: Door[] = [
  {
    to: "/planner",
    label: "Planner",
    hint: "Reorder the week",
    icon: SlidersHorizontal,
    tint: "var(--rainbow-orange)",
  },
  {
    to: "/playlists",
    label: "Playlists",
    hint: "Targets and sources",
    icon: ListVideo,
    tint: "var(--rainbow-blue)",
  },
  {
    to: "/progress",
    label: "Progress",
    hint: "Heatmap and trends",
    icon: Flame,
    tint: "var(--rainbow-green)",
  },
];

function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Jump to</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        {doors.map(({ to, label, hint, icon: Icon, tint }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-[3px] px-1.5 py-1.5 transition-colors duration-(--duration-fast) hover:bg-surface-2/70"
          >
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-[3px] border"
              style={{
                background: `color-mix(in oklab, ${tint} 10%, transparent)`,
                borderColor: `color-mix(in oklab, ${tint} 25%, transparent)`,
                color: tint,
              }}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-text-primary">{label}</span>
              <span className="block font-mono text-[9.5px] text-text-muted">{hint}</span>
            </span>
            <ArrowUpRight
              aria-hidden
              className="size-3.5 text-text-muted opacity-0 transition-all duration-(--duration-fast) group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ helpers */

function applyToggle(current: DashboardData, task: ScheduledTask, complete: boolean): DashboardData {
  const upd = (tasks: ScheduledTask[]) =>
    tasks.map((t) =>
      t.id === task.id
        ? { ...t, status: complete ? ("completed" as const) : ("pending" as const) }
        : t,
    );
  const wasDoneToday = current.completed_today > 0;
  const nextDone = Math.max(0, current.completed_today + (complete ? 1 : -1));

  // The streak only moves when the first task of the day lands (or when the
  // last one is reopened). Completing a second task never adds a day.
  let nextStreak = current.streak.current_streak;
  if (complete && !wasDoneToday) {
    nextStreak = wasLastDay(current.streak.last_completed_date) ? nextStreak + 1 : 1;
  } else if (!complete && current.completed_today === 1) {
    nextStreak = Math.max(0, nextStreak - 1);
  }

  return {
    ...current,
    today: { ...current.today, tasks: upd(current.today.tasks) },
    completed_today: nextDone,
    all_done: nextDone === current.planned_today && current.planned_today > 0,
    streak: {
      ...current.streak,
      current_streak: nextStreak,
      last_completed_date: complete
        ? formatDateKey(today())
        : current.streak.last_completed_date,
    },
  };
}

function wasLastDay(last?: string | null): boolean {
  if (!last) return false;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return formatDateKey(y) === last;
}

function trim(s: string): string {
  return s.length > 42 ? `${s.slice(0, 41)}…` : s;
}
