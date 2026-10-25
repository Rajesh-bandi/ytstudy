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
const STORAGE_KEY = "foxstudy.theme";

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "dark";
  });

  const resolve = useCallback((m: ThemeMode): "dark" | "light" => {
    return m === "system" ? (systemPrefersDark() ? "dark" : "light") : m;
  }, []);

  const [resolved, setResolved] = useState<"dark" | "light">(() => resolve(mode));

  useEffect(() => {
    const apply = () => {
      const r = resolve(mode);
      setResolved(r);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(r);
    };
    apply();
    localStorage.setItem(STORAGE_KEY, mode);

    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, resolve]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(
    () => setModeState(resolve(mode) === "dark" ? "light" : "dark"),
    [mode, resolve],
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
