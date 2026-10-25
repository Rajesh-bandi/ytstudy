import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  Flame,
  ListVideo,
  Minus,
  PartyPopper,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
  Zap,
} from "lucide-react";
import { api } from "@/services/api";
import type { CompanionSkin, DashboardData, DayPlan, ScheduledTask } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { formatDateKey, format, today } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar } from "@/components/ui/badge";
import { TaskListSkeleton, EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { TaskRow } from "@/components/tasks/task-row";
import { Companion, type CompanionState } from "@/components/companion/companion";
import { openCompanion } from "@/components/companion/bus";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
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
      setData(await api.getDashboard());
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

  return (
    <>
      <TopBar title="Home" subtitle={format(today(), "EEEE, d MMMM yyyy")} />
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
          {/* ---- Left: today's queue, then yesterday's ledger ---- */}
          <div className="flex flex-col gap-5 xl:col-span-2">
            <Card className="overflow-hidden">
              {/* Progress lip across the top of the card */}
              <div className="h-0.5 w-full bg-surface-2">
                <motion.div
                  className="h-full bg-linear-to-r from-accent to-accent-strong"
                  initial={{ width: 0 }}
                  animate={{
                    width: plannedToday > 0 ? `${(doneToday / plannedToday) * 100}%` : "0%",
                  }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  style={{ boxShadow: "0 0 12px var(--accent-glow)" }}
                />
              </div>

              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2.5">
                    <CardTitle>Today's tasks</CardTitle>
                    {data && plannedToday > 0 ? (
                      <span className="numeric text-xs text-text-muted">
                        <span className="text-accent">{doneToday}</span>
                        <span className="mx-0.5 opacity-60">/</span>
                        {plannedToday}
                      </span>
                    ) : null}
                  </div>

                  {/* One notch per task: the day, readable at a glance */}
                  {data && plannedToday > 0 ? (
                    <div className="flex items-center gap-1" aria-hidden>
                      {Array.from({ length: Math.min(plannedToday, 16) }).map((_, i) => (
                        <motion.span
                          key={i}
                          initial={false}
                          animate={{
                            backgroundColor: i < doneToday ? "var(--accent)" : "var(--surface-3)",
                            boxShadow: i < doneToday ? "0 0 8px -1px var(--accent-glow)" : "none",
                          }}
                          transition={{ duration: 0.28, delay: i * 0.02 }}
                          className="h-1.5 w-3.5 rounded-full"
                        />
                      ))}
                      {plannedToday > 16 ? (
                        <span className="numeric ml-1 text-[10px] text-text-muted">
                          +{plannedToday - 16}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
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
                  <div className="stagger divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-surface-2/55">
                    {data.today.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} onToggle={toggle} variant="row" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <YesterdayCard day={data?.yesterday} />
          </div>

          {/* ---- Right: momentum, the companion, and the doors ---- */}
          <div className="flex flex-col gap-5">
            <StreakCard streak={data?.streak} weekly={data?.weekly_completions} />
            <Card className="relative flex flex-col overflow-hidden">
              {/* A pool of warm light behind the character */}
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-16 left-1/2 size-52 -translate-x-1/2 rounded-full opacity-70 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in oklab, var(--accent) 45%, transparent), transparent 70%)",
                }}
              />
              <CardHeader className="relative">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{buddy.name}</CardTitle>
                  <span className="text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
                    {aiReady ? "connected" : "offline"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="relative flex flex-col items-center justify-center gap-3 py-5">
                <Companion
                  state={companionState}
                  stacked
                  size={82}
                  skin={buddy.skin}
                  name={buddy.name}
                />
                <div className="flex flex-col items-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={openCompanion}>
                    <Sparkles /> Ask {buddy.name}
                  </Button>
                  <Link
                    to={aiReady ? "/settings" : "/settings/ai"}
                    className="text-[10px] text-text-muted underline underline-offset-2 transition-colors hover:text-accent"
                  >
                    {aiReady ? "Change character" : "Connect AI for full answers"}
                  </Link>
                </div>
              </CardContent>
            </Card>
            <QuickActions />
          </div>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- yesterday */

function YesterdayCard({ day }: { day?: DayPlan }) {
  if (!day) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Yesterday</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="skeleton block h-12" />
        </CardContent>
      </Card>
    );
  }

  const done = day.tasks.filter((t) => t.status === "completed").length;
  const planned = day.tasks.length;
  const kept = planned > 0 && done === planned;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            Yesterday
            <span className="text-[11px] font-normal text-text-muted">
              {format(new Date(`${day.date}T12:00:00`), "EEE d MMM")}
            </span>
          </CardTitle>
          {planned === 0 ? (
            <Badge tone="neutral">nothing planned</Badge>
          ) : (
            <Badge tone={kept ? "success" : done > 0 ? "accent" : "neutral"}>
              {done} / {planned}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {planned === 0 ? (
          <p className="text-xs leading-relaxed text-text-muted">
            There was no plan for yesterday, so nothing was lost. Today's queue picks up where the
            playlist left off.
          </p>
        ) : (
          <ul className="flex flex-col">
            {day.tasks.slice(0, 6).map((t, i) => {
              const complete = t.status === "completed";
              return (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.22 }}
                  className={cn(
                    "flex items-center gap-2.5 py-1.5 text-xs",
                    i > 0 && "border-t border-border-subtle/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
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
                      complete ? "text-text-muted line-through decoration-text-muted/40" : "text-text-secondary",
                    )}
                  >
                    {t.item_title}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-muted">{t.playlist_title}</span>
                </motion.li>
              );
            })}
            {day.tasks.length > 6 ? (
              <li className="pt-1.5 text-[11px] text-text-muted">
                +{day.tasks.length - 6} more
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------- quick actions */

type Door = { to: string; label: string; hint: string; icon: typeof Flame; tint: string };

const doors: Door[] = [
  { to: "/planner", label: "Planner", hint: "Reorder the week", icon: SlidersHorizontal, tint: "var(--rainbow-orange)" },
  { to: "/playlists", label: "Playlists", hint: "Targets and sources", icon: ListVideo, tint: "var(--rainbow-blue)" },
  { to: "/progress", label: "Progress", hint: "Heatmap and trends", icon: Flame, tint: "var(--rainbow-green)" },
];

function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jump to</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {doors.map(({ to, label, hint, icon: Icon, tint }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-surface-2/70"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md border transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] group-hover:scale-105"
              style={{
                background: `color-mix(in oklab, ${tint} 14%, transparent)`,
                borderColor: `color-mix(in oklab, ${tint} 28%, transparent)`,
                color: tint,
              }}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-text-primary">{label}</span>
              <span className="block text-[11px] text-text-muted">{hint}</span>
            </span>
            <ArrowUpRight
              aria-hidden
              className="size-3.5 text-text-muted opacity-0 transition-all duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
            />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ streak */

function applyToggle(current: DashboardData, task: ScheduledTask, complete: boolean): DashboardData {
  const upd = (tasks: ScheduledTask[]) =>
    tasks.map((t) =>
      t.id === task.id
        ? { ...t, status: complete ? ("completed" as const) : ("pending" as const) }
        : t,
    );
  const delta = complete ? 1 : -1;
  const nextDone = current.completed_today + delta;
  return {
    ...current,
    today: { ...current.today, tasks: upd(current.today.tasks) },
    completed_today: nextDone,
    all_done: nextDone === current.planned_today && current.planned_today > 0,
    streak: {
      ...current.streak,
      current_streak: complete
        ? current.streak.current_streak + (wasLastDay(current.streak.last_completed_date) ? 1 : 1)
        : Math.max(0, current.streak.current_streak - 1),
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

function StreakCard({
  streak,
  weekly,
}: {
  streak?: DashboardData["streak"];
  weekly?: number;
}) {
  const weekTarget = 25;
  const weekPct = Math.min(1, (weekly ?? 0) / weekTarget);
  return (
    <Card className="relative overflow-hidden">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 size-32 rounded-full opacity-40 blur-2xl"
        style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }}
      />
      <CardHeader className="relative">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            Momentum
            {streak && streak.current_streak > 0 ? (
              <Flame className="size-3.5 text-streak flicker" aria-hidden />
            ) : null}
          </CardTitle>
          {streak && streak.current_streak === 0 ? (
            <Badge tone="neutral">start today</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="relative flex flex-col gap-4">
        {streak === undefined ? (
          <>
            <span className="skeleton h-16" />
            <span className="skeleton h-2" />
          </>
        ) : (
          <>
            {/* Hero metric: the streak is the one number worth shouting */}
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <motion.span
                  key={streak.current_streak}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className={cn(
                    "numeric text-[42px] font-bold leading-none",
                    streak.current_streak > 0 ? "text-warm" : "text-text-primary",
                  )}
                >
                  {streak.current_streak}
                </motion.span>
                <span className="pb-1 text-xs text-text-muted">day streak</span>
              </div>
              <div className="flex flex-col items-end gap-1 pb-1">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
                  <PartyPopper className="size-3" aria-hidden /> best
                </span>
                <span className="numeric text-sm font-semibold text-text-secondary">
                  {streak.best_streak}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-muted">This week</span>
                <span className="numeric text-text-secondary">
                  {weekly ?? 0}
                  <span className="text-text-muted"> / {weekTarget}</span>
                </span>
              </div>
              <ProgressBar value={weekPct} tone="success" className="h-2" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
