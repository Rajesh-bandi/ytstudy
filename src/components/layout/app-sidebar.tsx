import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Command,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListVideo,
  NotebookPen,
  Settings,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, isDesktop } from "@/services/api";
import { openCompanion } from "@/components/companion/bus";

type Meta = Record<string, string>;

/** Sidebar as a navigation ledger: every row names a screen and shows the
 *  number that matters for it, right-aligned, so the panel doubles as a
 *  status readout. */
const primary = [
  { to: "/", icon: LayoutDashboard, label: "Today", key: "today" },
  { to: "/planner", icon: SlidersHorizontal, label: "Planner", key: "planner" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", key: "calendar" },
  { to: "/playlists", icon: ListVideo, label: "Playlists", key: "playlists" },
  { to: "/progress", icon: TrendingUp, label: "Progress", key: "progress" },
] as const;

const tools = [
  { to: "/notes", icon: NotebookPen, label: "Notes", key: "notes" },
  { to: "/quizzes", icon: ListChecks, label: "Quizzes", key: "quizzes" },
  { to: "/flashcards", icon: Layers, label: "Flashcards", key: "cards" },
  { to: "/settings", icon: Settings, label: "Settings", key: "settings" },
] as const;

export function AppSidebar() {
  const [meta, setMeta] = useState<Meta>({});
  // Counters refresh per navigation so a generation is reflected on the spot.
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [dash, playlists, notes, quizzes, cards] = await Promise.all([
          api.getDashboard(),
          api.listPlaylists(),
          api.listNotes(),
          api.listQuizzes(),
          api.listFlashcards(),
        ]);
        if (!alive) return;
        setMeta({
          today: `${dash.completed_today}/${dash.planned_today}`,
          playlists: `${playlists.length}`,
          progress: `${dash.streak.current_streak}d`,
          notes: `${notes.length}`,
          quizzes: `${quizzes.length}`,
          cards: `${cards.length}`,
        });
      } catch {
        /* the sidebar never blocks the app on a failed stat fetch */
      }
    })();
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const doneToday = meta.today !== undefined && meta.today !== "0/0" ? meta.today : null;

  return (
    <nav
      aria-label="Primary"
      className="shell-sidebar flex h-full w-[236px] shrink-0 flex-col"
    >
      {/* Identity block */}
      <div className="border-b border-border px-4 py-4">
        <NavLink to="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-accent/40 bg-accent-soft font-mono text-[11px] font-bold tracking-[-0.04em] text-accent transition-colors group-hover:border-accent/70"
          >
            YT
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.02em] text-text-primary">
              YTStudy
            </span>
            <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
              one task at a time
            </span>
          </span>
        </NavLink>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <p className="micro px-2.5 pb-1.5">Plan</p>
        {primary.map((item) => (
          <Row key={item.to} item={item} meta={meta[item.key]} />
        ))}

        <p className="micro px-2.5 pb-1.5 pt-4">Study</p>
        {tools.map((item) => (
          <Row key={item.to} item={item} meta={meta[item.key]} />
        ))}
      </div>

      {/* Footer: the two facts worth keeping in sight */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="micro">streak</span>
          <span className="numeric text-[13px] font-medium text-accent">
            {meta.progress ?? "—"}
          </span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-text-muted">
          {doneToday ? `${doneToday} done today` : "loading day…"}
        </p>

        <button
          onClick={openCompanion}
          className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-[3px] border border-border px-2 py-1.5 text-[10.5px] text-text-muted transition-colors hover:border-border-strong hover:bg-surface-2/60 hover:text-text-secondary"
        >
          <span className="flex items-center gap-1.5">
            <Command className="size-3" aria-hidden />
            Companion
          </span>
          <span className="numeric text-[9.5px] opacity-70">⌘J</span>
        </button>

        {!isDesktop ? (
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-warning/80">
            preview · demo data
          </p>
        ) : null}
      </div>
    </nav>
  );
}

function Row({
  item,
  meta,
}: {
  item: (typeof primary)[number] | (typeof tools)[number];
  meta?: string;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center justify-between gap-2 rounded-[3px] px-2.5 py-[7px]",
          "text-[12.5px] transition-colors duration-(--duration-fast)",
          isActive
            ? "bg-surface-2 text-text-primary"
            : "text-text-secondary hover:bg-surface-2/55 hover:text-text-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full transition-colors",
              isActive ? "bg-accent" : "bg-transparent",
            )}
          />
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon
              className={cn(
                "size-[14px] shrink-0 transition-colors",
                isActive ? "text-accent" : "text-text-muted group-hover:text-text-secondary",
              )}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </span>
          {meta ? (
            <span className="numeric shrink-0 text-[10px] text-text-muted">{meta}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
