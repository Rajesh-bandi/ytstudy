import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
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
          planner: "week",
          calendar: "month",
          playlists: `${playlists.length}`,
          progress: `${dash.streak.current_streak}d`,
          notes: `${notes.length}`,
          quizzes: `${quizzes.length}`,
          cards: `${cards.length}`,
          settings: "",
        });
      } catch {
        /* the sidebar never blocks the app on a failed stat fetch */
      }
    })();
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  return (
    <nav
      aria-label="Primary"
      className="shell-sidebar flex h-full w-[228px] shrink-0 flex-col"
    >
      {/* Identity block, mirroring the reference's project panel */}
      <div className="border-b border-border px-4 py-4">
        <NavLink to="/" className="group block">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
            <span
              aria-hidden
              className="size-2 rounded-[1px] bg-warning"
            />
            FoxStudy
          </p>
          <p className="mt-0.5 pl-4 text-[10.5px] italic text-text-muted transition-colors group-hover:text-text-secondary">
            one task at a time
          </p>
        </NavLink>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {primary.map((item) => (
          <Row key={item.to} item={item} meta={meta[item.key]} />
        ))}

        <div className="px-2.5 pb-1 pt-4 text-[10px] uppercase tracking-[0.16em] text-text-muted/70">
          Study
        </div>
        {tools.map((item) => (
          <Row key={item.to} item={item} meta={meta[item.key]} />
        ))}
      </div>

      {/* Footer: the one number worth keeping in sight */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted">streak</span>
          <span className="numeric text-[13px] text-accent">{meta.progress ?? "—"}</span>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-text-muted/80">
          {meta.today ? `${meta.today} done today` : "loading day…"}
        </p>
        {!isDesktop ? (
          <p className="mt-1 text-[9.5px] uppercase tracking-[0.12em] text-warning/80">
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
          "text-[12.5px] transition-colors duration-[var(--duration-fast)]",
          isActive
            ? "bg-surface-2 text-text-primary"
            : "text-text-secondary hover:bg-surface-2/60 hover:text-text-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1.5 bottom-1.5 w-px rounded-full transition-colors",
              isActive ? "bg-accent" : "bg-transparent",
            )}
          />
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon
              className={cn(
                "size-[13px] shrink-0",
                isActive ? "text-accent" : "text-text-muted group-hover:text-text-secondary",
              )}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </span>
          {meta ? (
            <span className="numeric shrink-0 text-[10.5px] text-text-muted/80">{meta}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
