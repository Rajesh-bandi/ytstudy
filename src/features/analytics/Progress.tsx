import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarCheck,
  CheckCheck,
  Flame,
  Layers,
  ListChecks,
  Minus,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import EChart from "echarts-for-react";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import type {
  DayCompletion,
  Flashcard,
  HeatmapData,
  PlaylistProgress,
  Quiz,
  StreakStats,
} from "@/types";
import { format, parseKey } from "@/lib/date";
import { useTheme } from "@/app/providers/theme-provider";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, ProgressBar, SectionHeader } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HEATMAP_WINDOW = 182;
const TREND_WINDOW = 60;

interface ProgressData {
  heatmap: HeatmapData;
  streak: StreakStats;
  progress: PlaylistProgress[];
  trend: { date: string; completed: number }[];
  quizzes: Quiz[];
  cards: Flashcard[];
}

export default function Progress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [heatmap, streak, progress, trend, quizzes, cards] = await Promise.all([
        api.getHeatmap(HEATMAP_WINDOW),
        api.getStreaks(),
        api.getPlaylistProgress(),
        api.getCompletionsByDay(TREND_WINDOW),
        api.listQuizzes(),
        api.listFlashcards(),
      ]);
      setData({
        heatmap,
        streak,
        progress,
        trend: trend.length > 0 ? trend : aggregateFromHeatmap(heatmap),
        quizzes,
        cards,
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <TopBar
        title="Progress"
        subtitle="Consistency, velocity and recall — measured, not guessed"
      />
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        {error ? (
          <EmptyState
            icon={<Activity />}
            title="Couldn't read your progress"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : data === null ? (
          <ProgressSkeleton />
        ) : (
          <>
            <MomentumBand data={data} />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <ActivityCard data={data} />
              <WeekdayCard data={data} />
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <TrendCard data={data} />
              <PlaylistCard data={data} />
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <RecallCard data={data} />
              <Achievements data={data} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ momentum */

/** The top band: one hero number, two plain facts and a consistency ring.
 *  Different shapes on purpose, so the eye has an order to follow. */
function MomentumBand({ data }: { data: ProgressData }) {
  const days = data.heatmap.days;
  const last30 = days.slice(-30);
  const completions30 = sum(last30);
  const total = sum(days);
  const activeDays = days.filter((d) => d.completed > 0).length;
  const consistency = days.length > 0 ? activeDays / days.length : 0;
  const today = days[days.length - 1];
  const last7 = days.slice(-7);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
      {/* Hero streak */}
      <Card className="relative overflow-hidden lg:col-span-2">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent" />
        <CardContent className="flex flex-wrap items-end justify-between gap-4 py-5 pl-6">
          <div>
            <p className="micro flex items-center gap-1.5">
              <Flame className="size-3 text-streak" aria-hidden /> current streak
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <motion.span
                key={data.streak.current_streak}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className={cn(
                  "numeric text-[46px] font-bold leading-none tracking-[-0.04em]",
                  data.streak.current_streak > 0 ? "text-accent" : "text-text-primary",
                )}
              >
                {data.streak.current_streak}
              </motion.span>
              <span className="text-[12px] text-text-muted">
                day{data.streak.current_streak === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-text-muted">
              best {data.streak.best_streak} · {data.streak.qualifying_days_total} qualifying days
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <p className="micro">last 14 days</p>
            <div className="flex h-12 items-end gap-[3px]" aria-hidden>
              {days.slice(-14).map((d, i) => {
                const max = Math.max(1, ...days.slice(-14).map((x) => x.completed));
                return (
                  <motion.span
                    key={d.date}
                    initial={{ height: 2 }}
                    animate={{ height: `${Math.max(8, (d.completed / max) * 100)}%` }}
                    transition={{ delay: 0.02 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "w-[7px] rounded-[1px]",
                      d.completed > 0 ? "bg-accent/80" : "bg-surface-3",
                    )}
                  />
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              {last7.filter((d) => d.completed > 0).length}/7 active
            </span>
          </div>
        </CardContent>
      </Card>

      <StatTile
        icon={CheckCheck}
        label="Completions · 30d"
        value={completions30}
        hint={`${Math.round((completions30 / 30) * 10) / 10}/day average`}
        tone="success"
      />
      <Card className="relative overflow-hidden">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="micro flex items-center gap-1.5">
              <Activity className="size-3 text-info" aria-hidden /> consistency
            </p>
            <p className="numeric mt-1.5 text-[26px] font-semibold leading-none text-text-primary">
              {Math.round(consistency * 100)}%
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-muted">
              {activeDays} of {days.length} days had a completion
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              {total} total · today {today?.completed ?? 0}
            </p>
          </div>
          <Ring value={consistency} size={86} stroke={7} tone="var(--info)">
            <div className="text-center">
              <span className="numeric text-[15px] font-semibold text-text-primary">
                {activeDays}
              </span>
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-muted">
                days
              </span>
            </div>
          </Ring>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  hint: string;
  tone: "success" | "accent" | "info";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "info" ? "text-info" : "text-accent";
  return (
    <Card className="flex flex-col justify-between">
      <CardContent className="py-4">
        <p className="micro flex items-center gap-1.5">
          <Icon className={cn("size-3", color)} aria-hidden /> {label}
        </p>
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="numeric mt-1.5 text-[30px] font-semibold leading-none text-text-primary"
        >
          {value}
        </motion.p>
        <p className="mt-2 text-[10.5px] text-text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ activity */

function ActivityCard({ data }: { data: ProgressData }) {
  const days = data.heatmap.days;
  const total = sum(days);
  const best = Math.max(0, ...days.map((d) => d.completed));

  return (
    <Card className="min-w-0 xl:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Daily activity</CardTitle>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-text-muted">
              {days.length} days · {total} completions · best {best}
            </span>
            <HeatmapLegend />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Heatmap data={data.heatmap} />
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5 font-mono text-[10px] text-text-muted">
          <span>one cell = one day</span>
          <span>
            current run <span className="text-accent">{data.streak.current_streak}d</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Hand-built month grid: 26 weeks × 7 days. CSS grid keeps the cells square
 *  and the Gruvbox ramp exact, which ECharts' calendar would not. */
function Heatmap({ data }: { data: HeatmapData }) {
  const weeks = useMemo(() => buildWeeks(data), [data]);
  return (
    <div
      className="flex min-w-0 gap-2"
      role="img"
      aria-label={`Activity over ${data.days.length} days, ${sum(data.days)} completions`}
    >
      {/* Weekday gutter (Monday-first) */}
      <div className="mt-[15px] flex w-3 shrink-0 flex-col gap-[3px] pt-px font-mono text-[9px] leading-none text-text-muted">
        {["M", "", "W", "", "F", "", "S"].map((d, i) => (
          <span key={i} className="flex h-[13px] items-center">
            {d}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto pb-1">
        {/* Month labels sit above the week they start */}
        <div className="mb-1 flex gap-[3px]">
          {weeks.map((w, i) => (
            <span
              key={i}
              className="w-[13px] shrink-0 font-mono text-[9px] leading-none text-text-muted"
            >
              {w.label ?? ""}
            </span>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex shrink-0 flex-col gap-[3px]">
              {week.days.map((day) => (
                <motion.span
                  key={day.date}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(0.5, (wi * 7 + day.row) * 0.0012) }}
                  title={
                    day.empty
                      ? undefined
                      : `${format(parseKey(day.date), "EEE, d MMM")} — ${day.completed} completed`
                  }
                  className={cn(
                    "size-[13px] rounded-[2px] transition-transform duration-(--duration-fast)",
                    day.empty ? "opacity-0" : "hover:scale-125",
                  )}
                  style={{
                    background:
                      day.empty || day.level === 0
                        ? "var(--surface-2)"
                        : `color-mix(in oklab, var(--success) ${day.level * 22}%, var(--surface-2))`,
                    boxShadow:
                      day.empty || day.level === 0
                        ? "inset 0 0 0 1px color-mix(in oklab, var(--border) 70%, transparent)"
                        : undefined,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekdayCard({ data }: { data: ProgressData }) {
  const buckets = useMemo(() => weekdayBuckets(data.heatmap.days), [data.heatmap]);
  const max = Math.max(1, ...buckets.map((b) => b.average));
  const busiest = buckets.reduce((best, b) => (b.average > best.average ? b : best), buckets[0]!);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly rhythm</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex h-40 items-end gap-2 border-b border-border-subtle pb-2">
          {buckets.map((b, i) => (
            <div key={b.label} className="flex h-full flex-1 flex-col justify-end gap-1.5">
              <motion.div
                initial={{ height: 2 }}
                animate={{ height: `${Math.max(3, (b.average / max) * 100)}%` }}
                transition={{ delay: i * 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                title={`${b.label}: ${b.average.toFixed(1)} per day`}
                className={cn(
                  "w-full rounded-[2px]",
                  b.average === max ? "bg-accent" : "bg-[color-mix(in_oklab,var(--success)_55%,var(--surface-3))]",
                )}
              />
              <span className="text-center font-mono text-[9px] text-text-muted">
                {b.label.slice(0, 1)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="micro">busiest day</p>
            <p className="mt-1 text-[12.5px] text-text-primary">
              {busiest.label} · <span className="numeric text-accent">{busiest.average.toFixed(1)}</span>
              <span className="text-[10.5px] text-text-muted"> / day</span>
            </p>
          </div>
          <div className="text-right">
            <p className="micro">total</p>
            <p className="numeric mt-1 text-[15px] font-semibold text-text-primary">
              {sum(data.heatmap.days)}
            </p>
          </div>
        </div>

        <p className="text-[10.5px] leading-relaxed text-text-muted">
          Averaged across the whole window. Light days are part of a plan, not a failure — the
          pattern matters more than any single bar.
        </p>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- trend */

function TrendCard({ data }: { data: ProgressData }) {
  const palette = usePalette();
  const values = data.trend.map((d) => d.completed);
  const rolling = rollingAverage(values, 7);
  const last30 = sum(values.slice(-30));
  const prev30 = sum(values.slice(-60, -30));
  const delta = last30 - prev30;
  const best = data.trend.reduce(
    (top, d) => (d.completed > top.completed ? d : top),
    data.trend[0] ?? { date: "", completed: 0 },
  );

  return (
    <Card className="min-w-0 xl:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Completion trend</CardTitle>
          <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-4 bg-accent" aria-hidden /> daily
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-4 border-t border-dashed border-success" aria-hidden /> 7d
              average
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 divide-x divide-border-subtle">
          <Metric label="last 30 days" value={`${last30}`} sub="completions" />
          <Metric
            label="vs previous 30"
            value={`${delta > 0 ? "+" : ""}${delta}`}
            sub="change"
            tone={delta > 0 ? "success" : delta < 0 ? "warning" : "muted"}
            icon={delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus}
          />
          <Metric
            label="best day"
            value={best ? `${best.completed}` : "—"}
            sub={best?.date ? format(parseKey(best.date), "d MMM") : ""}
          />
        </div>

        {data.trend.length === 0 ? (
          <EmptyState icon={<TrendingUp />} title="No completions to plot yet" />
        ) : (
          <EChart
            option={trendOption(data.trend, rolling, palette)}
            style={{ height: 230, width: "100%" }}
            notMerge
            opts={{ renderer: "svg" }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "success" | "warning" | "muted";
  icon?: typeof Flame;
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-text-muted"
          : "text-text-primary";
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="micro">{label}</p>
      <p className={cn("numeric mt-1 flex items-center gap-1 text-[20px] font-semibold leading-none", color)}>
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {value}
      </p>
      <p className="mt-1 font-mono text-[9.5px] text-text-muted">{sub}</p>
    </div>
  );
}

/* ----------------------------------------------------------- playlists */

function PlaylistCard({ data }: { data: ProgressData }) {
  const rows = data.progress;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Playlist velocity</CardTitle>
          <Link
            to="/playlists"
            className="font-mono text-[10px] text-text-muted underline underline-offset-2 transition-colors hover:text-accent"
          >
            manage
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <EmptyState icon={<Trophy />} title="No playlists to compare yet" />
        ) : (
          rows.map((p, i) => {
            const rate = Math.max(0, Math.min(1, p.completion_rate));
            return (
              <motion.div
                key={p.playlist.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-[1px]"
                      style={{ background: p.playlist.color ?? "var(--text-muted)" }}
                      aria-hidden
                    />
                    <span className="truncate text-[12px] text-text-primary">
                      {p.playlist.title}
                    </span>
                    {p.overdue > 0 ? <Badge tone="warning">{p.overdue} late</Badge> : null}
                  </span>
                  <span className="numeric shrink-0 text-[10.5px] text-text-muted">
                    {Math.round(rate * 100)}%
                  </span>
                </div>
                <ProgressBar value={rate} tone={rate >= 1 ? "success" : "accent"} />
                <div className="flex items-center justify-between font-mono text-[9.5px] text-text-muted">
                  <span>
                    {p.completed_items}/{p.total_items} items
                  </span>
                  <span>
                    {p.completed_last_7} this week · target {p.playlist.daily_target}/day
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- recall */

function RecallCard({ data }: { data: ProgressData }) {
  const taken = data.quizzes.filter((q) => q.best_score !== null);
  const mean =
    taken.length === 0
      ? null
      : Math.round(
          (taken.reduce((s, q) => s + (q.best_score ?? 0) / Math.max(1, q.total), 0) /
            taken.length) *
            100,
        );
  const reviewed = data.cards.reduce((s, c) => s + c.reviews, 0);
  const untouched = data.cards.filter((c) => c.reviews === 0).length;

  const decks = useMemo(() => {
    const map = new Map<string, { cards: number; reviews: number }>();
    for (const card of data.cards) {
      const entry = map.get(card.deck) ?? { cards: 0, reviews: 0 };
      entry.cards += 1;
      entry.reviews += card.reviews;
      map.set(card.deck, entry);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].cards - a[1].cards)
      .slice(0, 4);
  }, [data.cards]);

  return (
    <Card className="min-w-0 xl:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Recall</CardTitle>
          <span className="micro">quizzes &amp; flashcards</span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center gap-4">
          <Ring value={(mean ?? 0) / 100} size={104} stroke={8} tone="var(--info)">
            <div className="text-center">
              <span className="numeric text-[19px] font-semibold leading-none text-text-primary">
                {mean === null ? "—" : `${mean}%`}
              </span>
              <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-muted">
                quiz mean
              </span>
            </div>
          </Ring>
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="micro">attempted</p>
              <p className="numeric text-[15px] font-semibold text-text-primary">
                {taken.length}
                <span className="text-[10.5px] font-normal text-text-muted"> / {data.quizzes.length}</span>
              </p>
            </div>
            <div>
              <p className="micro">card reviews</p>
              <p className="numeric text-[15px] font-semibold text-text-primary">
                {reviewed}
                <span className="text-[10.5px] font-normal text-text-muted">
                  {" "}
                  · {untouched} unseen
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <SectionHeader title="Decks" />
          {decks.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-text-muted">
              No flashcards yet. Generate a deck from any lesson; reviews and unseen cards land
              here.
            </p>
          ) : (
            decks.map(([deck, stats]) => (
              <div key={deck} className="flex items-center gap-3">
                <Layers className="size-3 shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-secondary">
                  {deck}
                </span>
                <span className="numeric shrink-0 font-mono text-[9.5px] text-text-muted">
                  {stats.cards} cards · {stats.reviews} reviews
                </span>
              </div>
            ))
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2.5">
            {taken.slice(0, 3).map((q) => (
              <Link
                key={q.id}
                to="/quizzes"
                className="flex items-center gap-1.5 rounded-[3px] border border-border px-2 py-1 font-mono text-[9.5px] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
              >
                <ListChecks className="size-2.5" aria-hidden />
                {q.best_score}/{q.total}
              </Link>
            ))}
            <Link
              to="/flashcards"
              className="ml-auto flex items-center gap-1 font-mono text-[10px] text-text-muted underline underline-offset-2 transition-colors hover:text-accent"
            >
              <BookOpen className="size-3" aria-hidden /> study
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- achievements */

function Achievements({ data }: { data: ProgressData }) {
  const total = sum(data.heatmap.days);
  const last7 = data.heatmap.days.slice(-7);
  const taken = data.quizzes.filter((q) => q.best_score !== null);
  const mean =
    taken.length === 0
      ? 0
      : Math.round(
          (taken.reduce((s, q) => s + (q.best_score ?? 0) / Math.max(1, q.total), 0) /
            taken.length) *
            100,
        );

  const badges: { icon: typeof Flame; label: string; done: boolean; detail: string }[] = [
    { icon: Flame, label: "First week", done: data.streak.best_streak >= 7, detail: "7-day run" },
    { icon: Trophy, label: "Month of days", done: data.streak.best_streak >= 30, detail: "30-day run" },
    { icon: CheckCheck, label: "Century", done: total >= 100, detail: "100 completions" },
    { icon: Target, label: "Sharp recall", done: mean >= 80, detail: "80% quiz mean" },
    { icon: Layers, label: "Deck builder", done: data.cards.length >= 10, detail: "10 cards" },
    {
      icon: CalendarCheck,
      label: "Full week",
      done: last7.length === 7 && last7.every((d) => d.completed > 0),
      detail: "7 active days",
    },
  ];
  const earned = badges.filter((b) => b.done).length;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5">
            <Award className="size-3.5 text-accent" aria-hidden /> Milestones
          </CardTitle>
          <Badge tone={earned > 0 ? "accent" : "neutral"}>
            {earned}/{badges.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {badges.map(({ icon: Icon, label, done, detail }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className={cn(
              "flex flex-col gap-1 rounded-[3px] border px-2.5 py-2",
              done
                ? "border-accent/35 bg-accent-soft"
                : "border-dashed border-border-subtle bg-surface-2/20",
            )}
          >
            <Icon
              className={cn("size-3.5", done ? "text-accent" : "text-text-muted/60")}
              aria-hidden
            />
            <span
              className={cn(
                "text-[11px] leading-tight",
                done ? "text-text-primary" : "text-text-muted",
              )}
            >
              {label}
            </span>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-muted">
              {detail}
            </span>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- primitives */

function Ring({
  value,
  size = 96,
  stroke = 7,
  tone = "var(--accent)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped * 100)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-4">
        <div className="skeleton h-36 lg:col-span-2" />
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="skeleton h-64 xl:col-span-2" />
        <div className="skeleton h-64" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="skeleton h-72 xl:col-span-2" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- heatmap data */

type HeatCell = { date: string; completed: number; level: number; row: number; empty?: boolean };

function buildWeeks(data: HeatmapData): { label: string | null; days: HeatCell[] }[] {
  const counts = new Map(data.days.map((d) => [d.date, d.completed]));
  const max = Math.max(1, ...data.days.map((d) => d.completed));
  const first = data.days[0] ? parseKey(data.days[0].date) : new Date();
  const last = data.days[data.days.length - 1]
    ? parseKey(data.days[data.days.length - 1]!.date)
    : new Date();

  // Rewind to the Monday on or before the first day
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const weeks: { label: string | null; days: HeatCell[] }[] = [];
  const cursor = new Date(start);
  let lastMonth = -1;

  while (cursor <= last) {
    const days: HeatCell[] = [];
    for (let row = 0; row < 7; row++) {
      const key = formatDateKeyLocal(cursor);
      const inRange = cursor >= first && cursor <= last;
      const completed = counts.get(key) ?? 0;
      days.push({
        date: key,
        completed,
        level: completed === 0 ? 0 : Math.min(4, Math.ceil((completed / max) * 4)),
        row,
        empty: !inRange,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    const month = parseKey(days[0]!.date).getMonth();
    const label =
      month !== lastMonth && days.some((d) => !d.empty)
        ? format(parseKey(days[0]!.date), "MMM")
        : null;
    lastMonth = month;
    weeks.push({ label, days });
  }
  return weeks;
}

function weekdayBuckets(days: DayCompletion[]) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const totals = labels.map(() => ({ total: 0, days: 0 }));
  for (const day of days) {
    const index = (parseKey(day.date).getDay() + 6) % 7;
    const bucket = totals[index]!;
    bucket.total += day.completed;
    bucket.days += 1;
  }
  return labels.map((label, i) => ({
    label,
    average: totals[i]!.days > 0 ? totals[i]!.total / totals[i]!.days : 0,
  }));
}

function rollingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return Math.round((sum(slice) / slice.length) * 100) / 100;
  });
}

function sum(values: { completed: number }[] | number[]): number {
  return values.reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : value.completed),
    0,
  );
}

/** Local (not UTC) yyyy-mm-dd, matching the date keys used by the backend. */
function formatDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------------------------------------------------- chart theme */

/** Charts cannot read CSS variables from an options object, so resolve
 *  the live token values and recompute whenever the theme flips. */
function usePalette() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      accent: v("--accent", "#fabd2f"),
      accentSoft: v("--accent-soft", "rgba(250,189,47,0.1)"),
      success: v("--success", "#b8bb26"),
      surface2: v("--surface-2", "#32302f"),
      border: v("--border", "#3c3836"),
      textMuted: v("--text-muted", "#a89984"),
      font: v("--font-mono", "monospace"),
    };
  }, [resolved]);
}

type Palette = ReturnType<typeof usePalette>;

function trendOption(
  data: { date: string; completed: number }[],
  rolling: number[],
  p: Palette,
): object {
  return {
    textStyle: { fontFamily: p.font },
    animationDuration: 700,
    grid: { left: 32, right: 12, top: 16, bottom: 26 },
    tooltip: {
      trigger: "axis",
      backgroundColor: p.surface2,
      borderColor: p.border,
      borderWidth: 1,
      padding: [6, 9],
      textStyle: { color: p.textMuted, fontSize: 11, fontFamily: p.font },
    },
    xAxis: {
      type: "category",
      data: data.map((d) => format(parseKey(d.date), "d MMM")),
      axisLabel: { color: p.textMuted, fontSize: 9, interval: Math.ceil(data.length / 7) },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.border } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: p.textMuted, fontSize: 9 },
      splitLine: { lineStyle: { color: p.border, type: "dashed", opacity: 0.6 } },
    },
    series: [
      {
        name: "daily",
        type: "line",
        data: data.map((d) => d.completed),
        smooth: 0.3,
        symbol: "circle",
        symbolSize: 5,
        showSymbol: false,
        lineStyle: { color: p.accent, width: 2 },
        itemStyle: { color: p.accent, borderColor: p.surface2, borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: p.accentSoft },
              { offset: 1, color: "transparent" },
            ],
          },
        },
      },
      {
        name: "7d average",
        type: "line",
        data: rolling,
        smooth: 0.4,
        symbol: "none",
        lineStyle: { color: p.success, width: 1.5, type: "dashed", opacity: 0.9 },
      },
    ],
  };
}

/** Fall back to heatmap-derived daily totals when the trend endpoint is thin. */
function aggregateFromHeatmap(h: HeatmapData) {
  return h.days.slice(-TREND_WINDOW).map((d) => ({ date: d.date, completed: d.completed }));
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[9px] text-text-muted">
      <span>less</span>
      {[0, 0.33, 0.66, 1].map((v) => (
        <span
          key={v}
          className="block size-2.5 rounded-[2px] border border-border"
          style={{
            background:
              v === 0
                ? "var(--surface-2)"
                : `color-mix(in oklab, var(--success) ${Math.round(v * 100)}%, var(--surface-2))`,
          }}
        />
      ))}
      <span>more</span>
    </div>
  );
}
