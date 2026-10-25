import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Flame, Minus, TrendingUp, Trophy } from "lucide-react";
import EChart from "echarts-for-react";
import { api } from "@/services/api";
import type { Flashcard, HeatmapData, PlaylistProgress, Quiz, StreakStats } from "@/types";
import { Link } from "react-router-dom";
import { format, parseKey } from "@/lib/date";
import { useTheme } from "@/app/providers/theme-provider";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, ProgressBar } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const HEATMAP_WINDOW = 182;

export default function Progress() {
  const palette = usePalette();
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [streak, setStreak] = useState<StreakStats | null>(null);
  const [progress, setProgress] = useState<PlaylistProgress[] | null>(null);
  const [trendDays, setTrendDays] = useState<{ date: string; completed: number }[] | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [cards, setCards] = useState<Flashcard[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [h, s, p, t, q, c] = await Promise.all([
        api.getHeatmap(HEATMAP_WINDOW),
        api.getStreaks(),
        api.getPlaylistProgress(),
        api.getCompletionsByDay(60),
        api.listQuizzes(),
        api.listFlashcards(),
      ]);
      setHeatmap(h);
      setStreak(s);
      setProgress(p);
      setTrendDays(t.length > 0 ? t : aggregateFromHeatmap(h));
      setQuizzes(q);
      setCards(c);
    })();
  }, []);

  return (
    <>
      <TopBar title="Progress" subtitle="Consistency, streaks and playlist velocity" />
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        {/* Streak summary strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            icon={<Flame className="size-3.5" />}
            label="Current streak"
            value={streak ? `${streak.current_streak}` : "…"}
            suffix="days"
            tone="streak"
          />
          <StatTile
            icon={<Trophy className="size-3.5" />}
            label="Best streak"
            value={streak ? `${streak.best_streak}` : "…"}
            suffix="days"
            tone="success"
          />
          <StatTile
            icon={<TrendingUp className="size-3.5" />}
            label="Qualifying days"
            value={streak ? `${streak.qualifying_days_total}` : "…"}
            suffix="total"
            tone="info"
          />
          <StatTile
            icon={<span aria-hidden>◷</span>}
            label="Last completed"
            value={
              streak?.last_completed_date
                ? format(parseKey(streak.last_completed_date), "d MMM")
                : "—"
            }
            suffix=""
            tone="neutral"
          />
        </div>

        {/* Heatmap */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Daily activity</CardTitle>
              <HeatmapLegend />
            </div>
          </CardHeader>
          <CardContent>
            {heatmap === null ? (
              <div className="skeleton h-28 rounded-md" />
            ) : (
              <Heatmap data={heatmap} />
            )}
          </CardContent>
        </Card>

        <Rhythm heatmap={heatmap} progress={progress} />

        <RevisionProgress quizzes={quizzes} cards={cards} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* Completion trend */}
          <Card>
            <CardHeader>
              <CardTitle>Completion trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trendDays === null ? (
                <div className="skeleton h-56 rounded-md" />
              ) : (
                <EChart
                  option={trendOption(trendDays, palette)}
                  style={{ height: 220, width: "100%" }}
                  notMerge
                  opts={{ renderer: "svg" }}
                />
              )}
            </CardContent>
          </Card>

          {/* Playlist comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Playlists</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              {progress === undefined ? null : progress === null ? (
                <div className="skeleton h-40 rounded-md" />
              ) : progress.length === 0 ? (
                <EmptyState icon={<Trophy />} title="No playlists to compare yet" />
              ) : (
                progress.map((p) => (
                  <div key={p.playlist.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            background: (p.playlist.color ?? "var(--text-muted)")!,
                            boxShadow: `0 0 8px -1px ${(p.playlist.color ?? "transparent") as string}`,
                          }}
                        />
                        <span className="truncate font-medium text-text-primary">
                          {p.playlist.title}
                        </span>
                        {p.overdue > 0 ? <Badge tone="warning">{p.overdue} overdue</Badge> : null}
                      </span>
                      <span className="numeric shrink-0 text-text-muted">
                        {p.completed_items}/{p.total_items} ·{" "}
                        {Math.round(p.completion_rate * 100)}%
                      </span>
                    </div>
                    <ProgressBar value={p.completion_rate} />
                    <span className="text-[10px] text-text-muted">
                      {p.completed_last_7} in last 7d · target {p.playlist.daily_target}/day
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- revision */

/** Quiz results and card reviews get their own progress lane: they measure
 *  recall, not whether a lesson was watched. */
function RevisionProgress({
  quizzes,
  cards,
}: {
  quizzes: Quiz[] | null;
  cards: Flashcard[] | null;
}) {
  if (quizzes === null || cards === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recall</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="skeleton h-28 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  const taken = quizzes.filter((q) => q.best_score !== null);
  const mean =
    taken.length === 0
      ? null
      : Math.round(
          (taken.reduce((s, q) => s + (q.best_score ?? 0) / Math.max(1, q.total), 0) /
            taken.length) *
            100,
        );
  const reviewed = cards.reduce((s, c) => s + c.reviews, 0);
  const untouched = cards.filter((c) => c.reviews === 0).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Recall</CardTitle>
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            quizzes &amp; flashcards
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[3px] border border-border-subtle bg-surface-2/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Quiz mean</p>
            <p className="numeric mt-1 text-[26px] font-semibold leading-none text-text-primary">
              {mean === null ? "—" : `${mean}%`}
            </p>
            <p className="mt-1 text-[10px] text-text-muted">
              {taken.length} of {quizzes.length} taken
            </p>
          </div>
          <div className="rounded-[3px] border border-border-subtle bg-surface-2/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Card reviews</p>
            <p className="numeric mt-1 text-[26px] font-semibold leading-none text-text-primary">
              {reviewed}
            </p>
            <p className="mt-1 text-[10px] text-text-muted">
              {untouched > 0 ? `${untouched} unseen` : cards.length > 0 ? "all seen" : "no cards"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {quizzes.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-text-muted">
              No quizzes yet. Generate one from a lesson and its score lands here — separate from
              the watching streak.
            </p>
          ) : (
            quizzes.slice(0, 4).map((q) => {
              const pct = q.best_score === null ? 0 : (q.best_score / Math.max(1, q.total)) * 100;
              return (
                <Link
                  key={q.id}
                  to="/quizzes"
                  className="group flex flex-col gap-1 rounded-[2px] px-1 py-1 transition-colors hover:bg-surface-2/50"
                >
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate text-text-secondary group-hover:text-text-primary">
                      {q.title}
                    </span>
                    <span className="numeric shrink-0 text-[10px] text-text-muted">
                      {q.best_score === null ? "not taken" : `${q.best_score}/${q.total}`}
                    </span>
                  </div>
                  <div className="panel-well h-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-info"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- rhythm */

type Bucket = { label: string; sub: string; total: number; current: boolean };

/** Weekly and monthly consistency, derived from the same 182-day heatmap so
 *  the two views can never disagree. */
function Rhythm({
  heatmap,
  progress,
}: {
  heatmap: HeatmapData | null;
  progress: PlaylistProgress[] | null;
}) {
  const weeks = useMemo(() => (heatmap ? weekBuckets(heatmap, 8) : []), [heatmap]);
  const months = useMemo(() => (heatmap ? monthBuckets(heatmap, 4) : []), [heatmap]);

  if (!heatmap || weeks.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly &amp; monthly rhythm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="skeleton h-36 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  const weeklyTarget = (progress ?? []).reduce(
    (sum, p) => sum + p.playlist.daily_target * 7,
    0,
  );
  const curWeek = weeks[weeks.length - 1]!;
  const prevWeek = weeks[weeks.length - 2]!;
  const curMonth = months[months.length - 1]!;
  const prevMonth = months[months.length - 2]!;
  const peak = Math.max(1, ...weeks.map((w) => w.total));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Weekly &amp; monthly rhythm</CardTitle>
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {weeklyTarget > 0 ? `plan target ${weeklyTarget} / week` : "no active target"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <PeriodStat
              label="This week"
              value={curWeek.total}
              prev={prevWeek.total}
              target={weeklyTarget || null}
              sub={curWeek.sub}
            />
            <PeriodStat
              label="This month"
              value={curMonth.total}
              prev={prevMonth.total}
              target={null}
              sub={curMonth.sub}
            />
          </div>

          {/* Eight weeks, one bar each. The current week is the lit one. */}
          <div>
            <div className="flex h-24 items-end gap-1.5 rounded-[3px] border border-border-subtle bg-bg-shade/40 px-2.5 pb-2 pt-3">
              {weeks.map((w, i) => {
                const h = Math.max(3, Math.round((w.total / peak) * 100));
                return (
                  <div key={w.label + i} className="group flex h-full flex-1 flex-col justify-end gap-1">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.45, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      title={`${w.label} — ${w.total} completed`}
                      className={cn(
                        "w-full rounded-[2px]",
                        w.current
                          ? "bg-accent"
                          : w.total === 0
                            ? "bg-surface-3"
                            : "bg-[color-mix(in_oklab,var(--success)_55%,var(--surface-3))] group-hover:bg-success",
                      )}
                    />
                    <span
                      className={cn(
                        "numeric text-center text-[8.5px] leading-none",
                        w.current ? "text-accent" : "text-text-muted",
                      )}
                    >
                      {w.label.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-text-muted">
              <span>8 weeks ago</span>
              <span>this week so far</span>
            </div>
          </div>
        </div>

        {/* Month ledger */}
        <div className="flex flex-col justify-center gap-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Months</p>
          {months.map((m) => {
            const top = Math.max(1, ...months.map((x) => x.total));
            return (
              <div key={m.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className={m.current ? "text-text-primary" : "text-text-secondary"}>
                    {m.label}
                    {m.current ? <span className="ml-1 text-[9px] text-accent">now</span> : null}
                  </span>
                  <span className="numeric text-text-muted">{m.total}</span>
                </div>
                <div className="panel-well h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", m.current ? "bg-accent" : "bg-success/70")}
                    style={{ width: `${Math.round((m.total / top) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            A week counts from Monday. "So far" means the period is still running.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PeriodStat({
  label,
  value,
  prev,
  target,
  sub,
}: {
  label: string;
  value: number;
  prev: number;
  target: number | null;
  sub: string;
}) {
  const delta = value - prev;
  const pct = target ? Math.min(1, value / target) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-[3px] border border-border-subtle bg-surface-2/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</span>
        <span className="text-[9.5px] text-text-muted">{sub}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="numeric text-[26px] font-semibold leading-none text-text-primary">
          {value}
        </span>
        <span
          className={cn(
            "numeric flex items-center gap-0.5 text-[10.5px]",
            delta > 0 ? "text-success" : delta < 0 ? "text-warning" : "text-text-muted",
          )}
          title={`previous period: ${prev}`}
        >
          {delta > 0 ? (
            <ArrowUpRight className="size-3" />
          ) : delta < 0 ? (
            <ArrowDownRight className="size-3" />
          ) : (
            <Minus className="size-3" />
          )}
          {delta === 0 ? "even" : `${Math.abs(delta)} vs prev`}
        </span>
      </div>
      {pct !== null ? (
        <div className="flex items-center gap-2">
          <div className="panel-well h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
          <span className="numeric text-[9.5px] text-text-muted">
            {Math.round(pct * 100)}%
          </span>
        </div>
      ) : null}
    </div>
  );
}

function weekBuckets(data: HeatmapData, count: number): Bucket[] {
  const counts = new Map(data.days.map((d) => [d.date, d.completed]));
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(12, 0, 0, 0);

  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    let total = 0;
    for (let d = 0; d < 7; d++) {
      const probe = new Date(start);
      probe.setDate(start.getDate() + d);
      total += counts.get(formatDateKeyLocal(probe)) ?? 0;
    }
    out.push({
      label: format(start, "d MMM"),
      sub: i === 0 ? "so far" : "complete",
      total,
      current: i === 0,
    });
  }
  return out;
}

function monthBuckets(data: HeatmapData, count: number): Bucket[] {
  const counts = new Map(data.days.map((d) => [d.date, d.completed]));
  const now = new Date();
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 12);
    let total = 0;
    const cursor = new Date(start);
    while (cursor.getMonth() === start.getMonth()) {
      total += counts.get(formatDateKeyLocal(cursor)) ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    out.push({
      label: format(start, "MMMM"),
      sub: i === 0 ? "so far" : "complete",
      total,
      current: i === 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------- heatmap */

/** Hand-built month grid: 26 weeks × 7 days. CSS grid keeps the cells
 *  square and the Gruvbox ramp exact, which ECharts' calendar would not. */
function Heatmap({ data }: { data: HeatmapData }) {
  const weeks = useMemo(() => buildWeeks(data), [data]);
  const total = data.days.reduce((sum, d) => sum + d.completed, 0);
  const best = Math.max(0, ...data.days.map((d) => d.completed));

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 gap-2" role="img" aria-label={`Activity over ${data.days.length} days, ${total} completions`}>
      {/* Weekday gutter (Monday-first) */}
      <div className="mt-[15px] flex w-3 shrink-0 flex-col gap-[3px] pt-px text-[9px] leading-none text-text-muted">
        {["M", "", "W", "", "F", "", "S"].map((d, i) => (
          <span key={i} className="flex h-[13px] items-center">
            {d}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        {/* Month labels sit above the week they start */}
        <div className="mb-1 flex gap-[3px]">
          {weeks.map((w, i) => (
            <span
              key={i}
              className="w-[13px] shrink-0 text-[9px] leading-none text-text-muted"
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
                  transition={{ delay: Math.min(0.5, (wi * 7 + day.row) * 0.0015) }}
                  title={
                    day.empty
                      ? undefined
                      : `${format(parseKey(day.date), "EEE, d MMM")} — ${day.completed} completed`
                  }
                  className={cn(
                    "size-[13px] rounded-[2.5px] transition-transform duration-[var(--duration-fast)]",
                    day.empty ? "opacity-0" : "hover:scale-125",
                  )}
                  style={{
                    background:
                      day.empty || day.level === 0
                        ? "var(--surface-2)"
                        : `color-mix(in oklab, var(--success) ${day.level * 25}%, var(--surface-2))`,
                    boxShadow:
                      !day.empty && day.level === 4
                        ? "0 0 6px -1px color-mix(in oklab, var(--success) 60%, transparent)"
                        : day.empty
                          ? undefined
                          : "inset 0 0 0 1px color-mix(in oklab, var(--border) 60%, transparent)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* The numbers the grid can't say out loud */}
      <div className="hidden shrink-0 flex-col items-end gap-1 pt-4 text-right md:flex">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Last {data.days.length} days
        </span>
        <span className="numeric text-[22px] font-semibold leading-none text-text-primary">
          {total}
        </span>
        <span className="text-[10px] text-text-muted">completions</span>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-text-muted">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          best day {best}
        </span>
      </div>
    </div>
  );
}

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
    const label = month !== lastMonth && days.some((d) => !d.empty)
      ? format(parseKey(days[0]!.date), "MMM")
      : null;
    lastMonth = month;
    weeks.push({ label, days });
  }
  return weeks;
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
      accentSoft: v("--accent-soft", "rgba(250,189,47,0.13)"),
      success: v("--success", "#b8bb26"),
      aqua: v("--gb-aqua", "#8ec07c"),
      surface2: v("--surface-2", "#32302f"),
      border: v("--border", "#3c3836"),
      textMuted: v("--text-muted", "#928374"),
      font: v("--font-sans", "system-ui"),
    };
  }, [resolved]);
}

type Palette = ReturnType<typeof usePalette>;

function trendOption(data: { date: string; completed: number }[], p: Palette): object {
  return {
    textStyle: { fontFamily: p.font },
    grid: { left: 30, right: 10, top: 14, bottom: 24 },
    tooltip: {
      trigger: "axis",
      backgroundColor: p.surface2,
      borderColor: p.border,
      textStyle: { color: p.textMuted, fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: data.map((d) => format(parseKey(d.date), "d MMM")),
      axisLabel: { color: p.textMuted, fontSize: 10, interval: Math.ceil(data.length / 8) },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.border } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: p.textMuted, fontSize: 10 },
      splitLine: { lineStyle: { color: p.border, type: "dashed" } },
    },
    series: [
      {
        type: "line",
        data: data.map((d) => d.completed),
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 5,
        showSymbol: false,
        lineStyle: { color: p.accent, width: 2, shadowBlur: 10, shadowColor: p.accentSoft },
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
    ],
  };
}

/** Fall back to heatmap-derived daily totals when the trend endpoint is thin. */
function aggregateFromHeatmap(h: HeatmapData) {
  return h.days.slice(-60).map((d) => ({ date: d.date, completed: d.completed }));
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
      <span>less</span>
      {[0, 0.33, 0.66, 1].map((v) => (
        <span
          key={v}
          className="block size-2.5 rounded-[2px] border border-border"
          style={{
            background:
              v === 0
                ? "var(--surface-2)"
                : `color-mix(in srgb, var(--success) ${Math.round(v * 100)}%, var(--surface-2))`,
          }}
        />
      ))}
      <span>more</span>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  tone: "streak" | "success" | "info" | "neutral";
}) {
  const toneMap = {
    streak: "text-streak",
    success: "text-success",
    info: "text-info",
    neutral: "text-text-muted",
  } as const;
  return (
    <Card className="relative overflow-hidden p-4">
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-px opacity-60", toneMap[tone])}
        style={{ background: "currentColor" }}
      />
      <span
        className={cn(
          "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em]",
          toneMap[tone],
        )}
      >
        {icon} {label}
      </span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <span className="numeric text-[26px] font-semibold leading-none text-text-primary">
          {value}
        </span>
        <span className="text-[11px] text-text-muted">{suffix}</span>
      </span>
    </Card>
  );
}
