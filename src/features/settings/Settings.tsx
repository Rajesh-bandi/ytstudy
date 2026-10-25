import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Monitor, Moon, Sparkles, Sun, Trash2, Zap } from "lucide-react";
import { api } from "@/services/api";
import type { AppSettings, CompanionSkin } from "@/types";
import { Character } from "@/components/companion/companion";
import {
  applyMotion,
  storedMotion,
  useTheme,
  type MotionPreference,
  type ThemeMode,
} from "@/app/providers/theme-provider";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "light", label: "Light", icon: Sun },
  { mode: "system", label: "System", icon: Monitor },
];

const characterSkins: { id: CompanionSkin; label: string }[] = [
  { id: "meep", label: "Meep" },
  { id: "fox", label: "Fox" },
  { id: "cat", label: "Cat" },
  { id: "orb", label: "Terminal" },
];

export default function Settings() {
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [motionPref, setMotionPref] = useState<MotionPreference>(storedMotion);
  const [horizon, setHorizon] = useState("21");

  useEffect(() => {
    void api.getSettings().then((s) => {
      setSettings(s);
      setHorizon(String(s.daily_horizon_days));
    });
  }, []);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await api.setSettings(patch);
    setSettings(next);
    toast("Preferences saved.", "success");
  }, []);

  const wipe = useCallback(async () => {
    setWiping(true);
    try {
      await api.wipeLearningData();
      setWipeOpen(false);
      setWipeText("");
      toast("All learning data erased — playlists, plan, streaks and notes are gone.", "success");
      // Home has to re-read everything it shows.
      navigate("/");
    } catch (e) {
      toast(`Could not erase: ${e}`, "error");
    } finally {
      setWiping(false);
    }
  }, [navigate]);

  return (
    <>
      <TopBar title="Settings" subtitle="Appearance, companion and study-day rules" />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Theme
              </span>
              <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                {THEME_OPTIONS.map(({ mode: m, label, icon: Icon }) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-xs font-medium",
                      "transition-[background-color,border-color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                      mode === m
                        ? "border-accent/70 bg-accent-soft text-text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_25%,transparent)]"
                        : "border-border bg-surface-2/50 text-text-secondary hover:-translate-y-px hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className={cn("size-3.5", mode === m && "text-accent")} /> {label}
                    </span>
                    {/* Swatch preview of the palette this option selects */}
                    <span className="flex gap-1" aria-hidden>
                      {(m === "dark"
                        ? ["#1d2021", "#282828", "#fabd2f", "#fe8019"]
                        : m === "light"
                          ? ["#fbf1c7", "#f2e5bc", "#af3a03", "#79740e"]
                          : ["#1d2021", "#fbf1c7", "#fabd2f", "#af3a03"]
                      ).map((c) => (
                        <span
                          key={c}
                          className="size-3 rounded-[2px] ring-1 ring-black/10"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Saved locally; System follows your OS dark-mode setting.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-2/40 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Zap className="size-4 shrink-0 text-warning" />
                <div>
                  <p className="text-sm text-text-primary">Reduce motion</p>
                  <p className="text-[11px] text-text-muted">
                    The app already honours your OS setting. Turn this on to collapse decorative
                    animation everywhere; the preference is remembered.
                  </p>
                </div>
              </div>
              <Switch
                ariaLabel="Reduce decorative animation"
                checked={motionPref === "reduced"}
                onCheckedChange={(v) => {
                  const next: MotionPreference = v ? "reduced" : "full";
                  setMotionPref(next);
                  applyMotion(next);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Link to="/settings/ai" className="block">
          <Card className="lift p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-[3px] border border-accent/30 bg-accent-soft text-accent">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[12.5px] text-text-primary">AI provider</p>
                  <p className="text-[10.5px] text-text-muted">
                    OmniRoute, OpenAI, OpenRouter, Groq or a local Ollama endpoint
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-text-muted" aria-hidden />
            </div>
          </Card>
        </Link>

        <Link to="/settings/prompts" className="block">
          <Card className="lift p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-[3px] border border-accent/30 bg-accent-soft text-accent">
                  <FileText className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[12.5px] text-text-primary">Generation prompts</p>
                  <p className="text-[10.5px] text-text-muted">
                    Edit what the model is told to write for notes, quizzes and cards — reset one
                    field at a time
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-text-muted" aria-hidden />
            </div>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Companion</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Field label="Name" hint="Used in the dock and on the home card">
                <Input
                  value={settings?.companion_name ?? ""}
                  maxLength={18}
                  placeholder="Meep"
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, companion_name: e.target.value } : s))
                  }
                  onBlur={(e) => void save({ companion_name: e.target.value.trim() || "Meep" })}
                />
              </Field>
              <div>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
                  Character
                </span>
                <div className="flex flex-wrap gap-2">
                  {characterSkins.map(({ id, label }) => {
                    const active = (settings?.companion_skin ?? "meep") === id;
                    return (
                      <button
                        key={id}
                        onClick={() => void save({ companion_skin: id as CompanionSkin })}
                        aria-pressed={active}
                        className={cn(
                          "flex w-[74px] flex-col items-center gap-1 rounded-[4px] border py-2 transition-colors",
                          active
                            ? "border-accent/60 bg-accent-soft"
                            : "border-border bg-surface-2/40 hover:border-border-strong hover:bg-surface-2",
                        )}
                      >
                        <Character mood={active ? "celebrating" : "idle"} skin={id} size={44} name={label} />
                        <span className={cn("text-[10px]", active ? "text-accent" : "text-text-muted")}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed text-text-muted">
              The companion reads your streak, today's queue, weekly completions and playlist progress.
              With a provider connected it can also answer doubts about any lesson and reorder flexible playlists.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule defaults</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              label="Minimum planning horizon (days)"
              hint="A floor only — the plan extends on its own until every playlist is finished."
            >
              <Input
                type="number"
                min={7}
                max={90}
                inputMode="numeric"
                className="w-32"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                onBlur={() => {
                  const v = Math.max(7, Math.min(90, Number(horizon) || 21));
                  setHorizon(String(v));
                  if (settings && v !== settings.daily_horizon_days) {
                    void save({ daily_horizon_days: v });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </Field>
            <div className="text-[11px] leading-relaxed text-text-muted">
              Each playlist keeps its own daily target. Strict playlists are laid out in sequence
              first; flexible ones then fill each day with the difficulty that balances it — lighter
              problems on days carrying a heavy lecture, harder ones on quiet days. A missed day is
              carried into the next free slot instead of stacking up. The horizon grows until the
              last item has a date.
            </div>
          </CardContent>
        </Card>

        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger">
              <Trash2 className="size-4" aria-hidden /> Danger zone
            </CardTitle>
            <CardDescription>
              Erase every piece of study data on this machine and start from zero.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 text-[11.5px] leading-relaxed sm:grid-cols-2">
              <ul className="flex flex-col gap-1 text-text-secondary">
                <li>· playlists, videos and their order</li>
                <li>· the plan, its pinning and completion history</li>
                <li>· streaks, heatmap and all progress counters</li>
              </ul>
              <ul className="flex flex-col gap-1 text-text-secondary">
                <li>· notes and every saved version</li>
                <li>· quizzes, flashcards and review scores</li>
                <li>· companion chat threads for every lesson</li>
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setWipeText("");
                  setWipeOpen(true);
                }}
              >
                <Trash2 /> Erase all learning data
              </Button>
              <span className="text-[11px] text-text-muted">
                Preferences, companion and your AI provider are kept.
              </span>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={wipeOpen}
          onOpenChange={(open) => {
            if (!open) setWipeText("");
            setWipeOpen(open);
          }}
        >
          <DialogContent
            title="Erase everything?"
            description="Playlists, plan, streaks, notes, quizzes, flashcards and chat history are deleted from this machine. There is no undo."
          >
            <div className="flex flex-col gap-4">
              <Field label="Type wipe to confirm" hint="Your AI provider and preferences stay as they are.">
                <Input
                  autoFocus
                  value={wipeText}
                  placeholder="wipe"
                  onChange={(e) => setWipeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && wipeText.trim().toLowerCase() === "wipe") {
                      void wipe();
                    }
                  }}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWipeOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={wipeText.trim().toLowerCase() !== "wipe" || wiping}
                  onClick={() => void wipe()}
                >
                  {wiping ? "Erasing…" : "Erase my data"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
