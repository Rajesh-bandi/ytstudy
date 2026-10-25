import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "dark" | "light" | "system";
export type MotionPreference = "full" | "reduced";

const STORAGE_KEY = "ytstudy.theme";
const MOTION_KEY = "ytstudy.motion";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "dark" | "light";
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function storedMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "dark";
}

function resolveMode(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

/** The app-level motion switch. "full" keeps the design's motion; "reduced"
 *  collapses decorative animation (motion.css keys off data-motion). */
export function storedMotion(): MotionPreference {
  return localStorage.getItem(MOTION_KEY) === "reduced" ? "reduced" : "full";
}

export function applyMotion(preference: MotionPreference): void {
  document.documentElement.dataset.motion = preference;
  localStorage.setItem(MOTION_KEY, preference);
}

/** Called once from main.tsx before React renders. Kept in this module so the
 *  provider and the first paint can never disagree about the theme. */
function applyThemeColor(resolved: "dark" | "light"): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#1d2021" : "#ebdbb2");
}

export function applyBootPreferences(): void {
  const resolved = resolveMode(storedMode());
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  applyThemeColor(resolved);
  // Only force the attribute when the learner asked for reduced motion; a
  // missing attribute lets the OS media query in motion.css decide.
  if (storedMotion() === "reduced") root.dataset.motion = "reduced";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [resolved, setResolved] = useState<"dark" | "light">(() => resolveMode(storedMode()));

  useEffect(() => {
    const apply = () => {
      const next = resolveMode(mode);
      setResolved(next);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(next);
      applyThemeColor(next);
    };
    apply();
    localStorage.setItem(STORAGE_KEY, mode);

    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(
    () => setModeState(resolveMode(mode) === "dark" ? "light" : "dark"),
    [mode],
  );

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
