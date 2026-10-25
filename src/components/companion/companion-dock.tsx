import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { Flame, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { api } from "@/services/api";
import type { AiConfig, ChatMessage, CompanionSkin, DashboardData } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { Markdown } from "@/components/markdown/markdown";
import { Character, type CompanionState } from "./companion";
import { COMPANION_OPEN_EVENT } from "./bus";
import { cn } from "@/lib/utils";

/* The companion lives in the shell, not in one screen: a single floating
   character that can be pulled open anywhere, knows the learner's real
   progress, and answers doubts. Without an API key it degrades into a
   local progress assistant instead of an error. */

function moodOf(data: DashboardData | null): CompanionState {
  if (!data) return "idle";
  if (data.all_done) return "celebrating";
  if (data.planned_today === 0) return "idle";
  if (data.completed_today > 0) return "focused";
  if (data.streak.current_streak === 0) return "encouraging";
  return "idle";
}

const MOOD_LABEL: Record<CompanionState, string> = {
  idle: "resting",
  focused: "watching the clock",
  thinking: "thinking",
  celebrating: "delighted",
  encouraging: "cheering you on",
};

const QUICK: string[] = [
  "How am I doing this week?",
  "What should I do next?",
  "Plan the rest of today",
  "Explain today's hardest topic",
];

export function CompanionDock() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [name, setName] = useState(DEFAULT_SETTINGS.companion_name);
  const [skin, setSkin] = useState<CompanionSkin>(DEFAULT_SETTINGS.companion_skin);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const aiReady = Boolean(cfg?.enabled && cfg.api_key.trim().length > 0);
  const mood = moodOf(data);

  /* ------------------------------ data ------------------------------ */

  const refresh = useCallback(async () => {
    try {
      const [dash, config, settings] = await Promise.all([
        api.getDashboard(),
        api.getAiConfig(),
        api.getSettings(),
      ]);
      setData(dash);
      setCfg(config);
      setName(settings.companion_name?.trim() || DEFAULT_SETTINGS.companion_name);
      setSkin((settings.companion_skin as CompanionSkin) ?? DEFAULT_SETTINGS.companion_skin);
    } catch {
      /* the dock never breaks the shell */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20000);
    return () => clearInterval(t);
  }, [refresh]);

  // The conversation is stored in SQLite, so reopening the app continues
  // where the learner left off instead of starting over.
  useEffect(() => {
    let alive = true;
    void api
      .listChat("companion")
      .then((stored) => {
        if (alive && stored.length > 0) setMessages(stored);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Greeting is recomputed from live data until the learner says something.
  useEffect(() => {
    if (!data || !hydrated || messages.length > 0) return;
    const planned = data.planned_today;
    const done = data.completed_today;
    const left = Math.max(0, planned - done);
    const greeting =
      planned === 0
        ? "Nothing is scheduled today. Paste a playlist and I'll build the week for you."
        : data.all_done
          ? `All ${planned} done — day cleared. That's ${data.streak.current_streak} day${
              data.streak.current_streak === 1 ? "" : "s"
            } in a row.`
          : `${done} of ${planned} done, ${left} to go. ${
              aiReady
                ? "Ask me about any of them."
                : "Connect a provider in Settings → AI and I can explain anything."
            }`;
    setMessages([{ role: "assistant", content: greeting }]);
  }, [data, aiReady, hydrated, messages.length]);

  // Keyboard: ⌘/Ctrl + J toggles, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMPANION_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMPANION_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 160);
  }, [open]);

  /* ------------------------------ chat ------------------------------ */

  const push = (m: ChatMessage) =>
    setMessages((prev) => {
      const next = [...prev, m];
      setTimeout(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 40);
      return next;
    });

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      const history: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(history);
      setDraft("");
      setError(null);

      // With no key, answer progress questions locally and instantly. This is
      // the companion's baseline competence, not an error path.
      if (!aiReady) {
        const local = localAnswer(question, data);
        if (local) {
          push({ role: "assistant", content: local });
          return;
        }
      }

      setBusy(true);
      try {
        const reply = await api.aiChat(
          [{ role: "user", content: question }],
          null,
          "companion",
        );
        push({ role: "assistant", content: reply });
      } catch (e) {
        // Graceful degradation: local answers about real progress still work.
        const local = localAnswer(question, data);
        setError(aiReady ? String(e) : null);
        if (local) {
          push({ role: "assistant", content: local });
        } else {
          push({
            role: "assistant",
            content: aiReady
              ? `I couldn't reach the gateway. ${
                  e instanceof Error ? e.message : String(e)
                }`
              : "I need a provider for that one. **Settings → AI** takes one URL, a model and a key — then I can explain any lesson, and I can read your progress while I do it.",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, data, aiReady],
  );

  /* ------------------------------ render ------------------------------ */

  return (
    <>
      {/* Launcher */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close companion" : `Ask ${name}`}
        aria-expanded={open}
        className={cn(
          "group fixed bottom-5 right-5 z-[var(--z-companion)] flex items-center gap-2 rounded-full",
          "border border-border-strong bg-surface pl-2 pr-3.5 py-1.5 shadow-[var(--shadow-lg)]",
          "transition-colors hover:border-accent/60 hover:bg-surface-2",
        )}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <span className="relative">
          <Character mood={mood} skin={skin} size={34} name={name} />
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 top-0 size-2 rounded-full ring-2 ring-surface",
              aiReady ? "bg-accent" : "bg-text-muted",
            )}
          />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11.5px] font-medium text-text-primary">{name}</span>
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
            {aiReady ? "ask anything" : "progress only"}
          </span>
        </span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            {/* No scrim: the dock is a companion, not a modal. The rest of
                the app stays fully usable while it is open. */}
            <motion.aside
              key="panel"
              role="dialog"
              aria-label={`${name}, your study companion`}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="panel-raised fixed bottom-[84px] right-5 z-[var(--z-companion)] flex max-h-[min(660px,76vh)] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl"
            >
              {/* Header */}
              <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                <Character mood={mood} skin={skin} size={44} name={name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                    {name}
                    <span className="text-[10px] font-normal text-text-muted">
                      · {MOOD_LABEL[mood]}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-text-muted">
                    {aiReady ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                        {cfg?.model} connected
                      </span>
                    ) : (
                      <Link to="/settings/ai" className="underline underline-offset-2 hover:text-accent">
                        connect a provider for full answers
                      </Link>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    setMessages([]);
                    void api.clearChat("companion").catch(() => {});
                  }}
                  aria-label="Start a new conversation"
                  title="New conversation"
                  className="rounded-[2px] p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <RotateCcw className="size-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close companion"
                  className="rounded-[2px] p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Live progress strip */}
              <div className="grid grid-cols-3 divide-x divide-border-subtle border-b border-border-subtle bg-surface-2/40">
                <Stat
                  label="today"
                  value={data ? `${data.completed_today}/${data.planned_today}` : "…"}
                  tone="accent"
                />
                <Stat
                  label="streak"
                  value={data ? `${data.streak.current_streak}d` : "…"}
                  tone="streak"
                  icon={<Flame className="size-3" aria-hidden />}
                />
                <Stat
                  label="this week"
                  value={data ? `${data.weekly_completions}` : "…"}
                  tone="info"
                />
              </div>

              {/* Thread */}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn("flex gap-2", m.role === "user" && "justify-end")}
                  >
                    {m.role === "assistant" ? (
                      <Character mood={mood} skin={skin} size={22} name={name} />
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[46ch] rounded-md border px-2.5 py-2",
                        m.role === "user"
                          ? "border-accent/25 bg-accent-soft text-text-primary"
                          : "border-border-subtle bg-surface-2/50 text-text-secondary",
                      )}
                    >
                      {m.role === "assistant" ? (
                        <Markdown className="md-chat">{m.content}</Markdown>
                      ) : (
                        <p className="text-[12px] leading-relaxed">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {busy ? (
                  <p className="flex items-center gap-2 pl-8 text-[11px] text-text-muted">
                    <Loader2 className="size-3 animate-spin text-accent" /> thinking…
                  </p>
                ) : null}

                {error ? (
                  <p className="rounded-[3px] border border-danger/35 bg-danger-soft px-2.5 py-2 text-[10.5px] leading-relaxed text-danger">
                    {error}
                  </p>
                ) : null}

                <div ref={end} />

                {/* Suggestions, only before the first question */}
                {messages.length <= 1 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => void send(q)}
                        className="rounded-full border border-border px-2.5 py-1 text-[10.5px] text-text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-text-primary"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Composer */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
                className="flex items-end gap-2 border-t border-border bg-bg-shade/40 px-3 py-2.5"
              >
                <textarea
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={1}
                  placeholder={aiReady ? "Ask a doubt, or about your plan…" : "Ask about today's progress…"}
                  aria-label="Message the companion"
                  className="max-h-28 min-h-[38px] flex-1 resize-none rounded-[3px] border border-border bg-surface px-2.5 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  aria-label="Send"
                  className="flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-accent/40 bg-accent-soft text-accent transition-colors hover:bg-accent hover:text-accent-contrast disabled:opacity-40 disabled:hover:bg-accent-soft disabled:hover:text-accent"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>

              <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5 text-[9.5px] text-text-muted">
                <span className="flex items-center gap-1">
                  <Sparkles className="size-2.5" aria-hidden />
                  reads your streak, plan and playlist progress
                </span>
                <span className="numeric">⌘J</span>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "accent" | "streak" | "info";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "accent" ? "text-accent" : tone === "streak" ? "text-streak" : "text-info";
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-2">
      <span className={cn("numeric flex items-center gap-1 text-[14px] font-semibold leading-none", color)}>
        {icon}
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted">{label}</span>
    </div>
  );
}

/** Deterministic answers from local data. This is what the companion can do
 *  with no key and no network — never an apology, always the next action. */
function localAnswer(question: string, data: DashboardData | null): string | null {
  if (!data) return null;
  const q = question.toLowerCase();
  const done = data.completed_today;
  const planned = data.planned_today;
  const left = Math.max(0, planned - done);
  const open = data.today.tasks.filter((t) => t.status !== "completed");

  if (/streak/.test(q)) {
    return `You're on a **${data.streak.current_streak}-day streak** (best: ${data.streak.best_streak}). ${
      data.streak.current_streak > 0
        ? "One task today keeps it alive."
        : "One task today starts the next run."
    }`;
  }

  if (/(next|left|remain|todo|to do|today|focus)/.test(q)) {
    if (planned === 0) {
      return "Nothing is scheduled today yet. Add or import a playlist and the planner fills the queue for you.";
    }
    if (left === 0) {
      return `Today is **cleared** — ${done}/${planned}. Anything you do now is a bonus on tomorrow's start.`;
    }
    const list = open
      .slice(0, 3)
      .map((t) => `- ${t.item_title} — *${t.playlist_title}*`)
      .join("\n");
    return `**${left} left today** (${done}/${planned} done):\n\n${list}${
      open.length > 3 ? `\n\n…and ${open.length - 3} more.` : ""
    }\n\nStart with the shortest one — momentum beats order.`;
  }

  if (/(week|progress|doing|doing|how am i|report)/.test(q)) {
    return `This week: **${data.weekly_completions} completions**. Today: ${done}/${planned}. Current streak: ${
      data.streak.current_streak
    } day${data.streak.current_streak === 1 ? "" : "s"}, best ${data.streak.best_streak}. The Progress screen has the full heatmap and per-playlist velocity.`;
  }

  if (/(plan|schedule|reorder|order)/.test(q)) {
    return "Open **Playlists → a flexible playlist → Order with companion** and I'll cluster the problems by topic and ramp the difficulty. Strict courses keep their sequence. The daily quota per playlist is already applied by the deterministic planner.";
  }

  return null;
}
