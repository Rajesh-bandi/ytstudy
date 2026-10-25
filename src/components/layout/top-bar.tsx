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
 *  Big title, a mono meta line, then a hairline rule. */
export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <header className="shell-header sticky top-0 z-[var(--z-topbar)] shrink-0 px-6 pb-4 pt-5 lg:px-7">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] leading-none text-text-muted">
              <span className="size-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="truncate">{subtitle}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface/60 p-0.5">
          {(Object.keys(ICONS) as ThemeMode[]).map((m) => {
            const Icon = ICONS[m]!;
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-label={LABELS[m]}
                aria-pressed={active}
                title={LABELS[m]}
                className={cn(
                  "relative rounded-[3px] px-2 py-1.5 transition-colors",
                  active
                    ? "text-accent"
                    : "text-text-muted hover:bg-surface-2/70 hover:text-text-secondary",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="theme-thumb"
                    transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    className="absolute inset-0 rounded-[3px] bg-surface-2"
                  />
                ) : null}
                <Icon className="relative size-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
