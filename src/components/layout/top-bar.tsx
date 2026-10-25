import { motion } from "motion/react";
import { useTheme, type ThemeMode } from "@/app/providers/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemeMode, typeof Sun> = { dark: Moon, light: Sun, system: Monitor };

const LABELS: Record<ThemeMode, string> = {
  dark: "Dark theme",
  light: "Light theme",
  system: "Match system",
};

/** Page header: the typographic anchor of every screen.
 *  Big mono title, an accent meta line, then a hairline rule — the
 *  editorial structure the whole app reads against. */
export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { mode, setMode, resolved, toggle } = useTheme();

  return (
    <header className="shell-header sticky top-0 z-[var(--z-topbar)] shrink-0 px-7 pb-4 pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-[1.12] tracking-[-0.035em] text-text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 flex items-center gap-2 text-[11.5px] leading-none text-text-muted">
              <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              <span className="truncate">{subtitle}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-[3px] border border-border p-0.5">
            {(Object.keys(ICONS) as ThemeMode[]).map((m) => {
              const Icon = ICONS[m]!;
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-label={LABELS[m]}
                  aria-pressed={active}
                  className={cn(
                    "relative rounded-[2px] px-1.5 py-1 transition-colors",
                    active ? "text-accent" : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="theme-thumb"
                      transition={{ type: "spring", stiffness: 520, damping: 36 }}
                      className="absolute inset-0 rounded-[2px] bg-surface-2"
                    />
                  ) : null}
                  <Icon className="relative size-3.5" />
                </button>
              );
            })}
          </div>

          <button
            onClick={toggle}
            aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
            className="rounded-[3px] border border-border px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary"
          >
            {resolved === "dark" ? "ink" : "char"}
          </button>
        </div>
      </div>
    </header>
  );
}
