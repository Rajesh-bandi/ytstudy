import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Check,
  ExternalLink,
  FileText,
  History,
  Layers,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  NotebookPen,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { api } from "@/services/api";
import type {
  ChatMessage,
  Flashcard,
  Job,
  Note,
  NoteVersion,
  Playlist,
  PlaylistItem,
  Quiz,
  ScheduledTask,
} from "@/types";
import { format, parseKey } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown/markdown";
import { EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { openExternal } from "@/lib/open-external";
import { cn } from "@/lib/utils";

type Tab = "notes" | "doubts" | "quiz" | "cards";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "doubts", label: "Ask", icon: MessageCircleQuestion },
  { id: "quiz", label: "Quiz", icon: ListChecks },
  { id: "cards", label: "Cards", icon: Layers },
];

interface LessonContext {
  item: PlaylistItem;
  playlist?: Playlist;
  task?: ScheduledTask;
}

export default function Learn() {
  const { itemId = "" } = useParams();
  const [ctx, setCtx] = useState<LessonContext | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("notes");

  const [note, setNote] = useState<Note | null>(null);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  // Reading an older version is a preview, not a write: nothing changes until
  // the learner presses Restore.
  const [preview, setPreview] = useState<NoteVersion | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [aiReady, setAiReady] = useState(false);

  const seen = useRef<Record<string, string>>({});

  /* ---------------------------- loading ---------------------------- */

  const resolveItem = useCallback(async (): Promise<LessonContext | null> => {
    const dash = await api.getDashboard();
    const all: ScheduledTask[] = [dash.today, dash.yesterday].flatMap((d) => d.tasks);
    const now = new Date();
    const start = new Date(now.getTime() - 21 * 86400000);
    const end = new Date(now.getTime() + 21 * 86400000);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const range = await api.getRangePlans(key(start), key(end));
    const tasks = [...all, ...range.flatMap((d) => d.tasks)];
    const task = tasks.find((t) => t.item_id === itemId);
    if (task) {
      const playlists = await api.listPlaylists();
      return {
        item: {
          id: task.item_id,
          playlist_id: task.playlist_id,
          source_item_id: null,
          title: task.item_title,
          url: task.item_url,
          position: 0,
          topic: null,
          difficulty: null,
          duration_seconds: null,
          completed: task.status === "completed",
        },
        playlist: playlists.find((p) => p.id === task.playlist_id),
        task,
      };
    }

    // Not scheduled: fall back to a direct scan so old lessons still open.
    const playlists = await api.listPlaylists();
    for (const p of playlists) {
      const items = await api.listItems(p.id);
      const found = items.find((i) => i.id === itemId);
      if (found) return { item: found, playlist: p };
    }
    return null;
  }, [itemId]);

  const loadArtifacts = useCallback(async () => {
    setPreview(null);
    const [n, q, c, cfg] = await Promise.all([
      api.getNote(itemId),
      api.listQuizzes(),
      api.listFlashcards(),
      api.getAiConfig(),
    ]);
    setNote(n);
    if (n) setVersions(await api.noteVersions(n.id));
    setQuizzes(q.filter((x) => x.item_id === itemId));
    setCards(c.filter((x) => x.item_id === itemId));
    setAiReady(cfg.enabled && cfg.api_key.trim().length > 0);
  }, [itemId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const resolved = await resolveItem();
      if (!alive) return;
      if (!resolved) {
        setNotFound(true);
        return;
      }
      setCtx(resolved);
      await loadArtifacts();
    })();
    return () => {
      alive = false;
    };
  }, [resolveItem, loadArtifacts]);

  /* ------------------------- job progress ------------------------- */

  const refreshJobs = useCallback(async () => {
    const list = await api.listJobs();
    const mine = list.filter((j) => j.item_id === itemId).slice(0, 6);
    setJobs(mine);

    for (const job of mine) {
      const before = seen.current[job.id];
      seen.current[job.id] = job.status;
      if (before && before !== job.status && (job.status === "done" || job.status === "failed")) {
        if (job.status === "done") {
          const label =
            job.kind === "generate_note"
              ? "Notes ready"
              : job.kind === "generate_quiz"
                ? "Quiz ready"
                : "Flashcards ready";
          toast(`${label} — open the ${job.kind === "generate_note" ? "Notes" : job.kind === "generate_quiz" ? "Quiz" : "Cards"} tab.`, "success");
          await loadArtifacts();
        } else {
          toast(`Generation failed: ${job.error ?? "unknown error"}`, "error");
        }
      }
    }
  }, [itemId, loadArtifacts]);

  useEffect(() => {
    void refreshJobs();
    const t = setInterval(() => void refreshJobs(), 1800);
    return () => clearInterval(t);
  }, [refreshJobs]);

  const generate = useCallback(
    async (kind: "generate_note" | "generate_quiz" | "generate_flashcards") => {
      if (!aiReady) {
        toast("Add your AI gateway in Settings → AI first.", "error");
        return;
      }
      await api.enqueueGeneration(kind, itemId, ctx?.playlist?.id ?? null);
      toast("Queued — I'll tell you when it's ready.", "info");
      await refreshJobs();
    },
    [aiReady, itemId, ctx, refreshJobs],
  );

  /* ---------------------------- actions ---------------------------- */

  const toggleComplete = useCallback(async () => {
    if (!ctx?.task) return;
    if (ctx.task.status === "completed") await api.uncompleteTask(ctx.task.id);
    else await api.completeTask(ctx.task.id);
    setCtx({
      ...ctx,
      task: {
        ...ctx.task,
        status: ctx.task.status === "completed" ? "pending" : "completed",
      },
    });
  }, [ctx]);

  const saveDraft = useCallback(async () => {
    if (draft === null || !ctx) return;
    const saved = await api.saveNote(ctx.item.id, ctx.item.title, draft, "user");
    setNote(saved);
    setDraft(null);
    setVersions(await api.noteVersions(saved.id));
    toast("Note saved as a new version.", "success");
  }, [draft, ctx]);

  const playable = useMemo(() => youtubeId(ctx?.item.url ?? null), [ctx]);

  if (notFound) {
    return (
      <>
        <TopBar title="Lesson not found" subtitle="It may have been removed from its playlist" />
        <div className="p-6">
          <EmptyState icon={<Play />} title="This lesson no longer exists" />
        </div>
      </>
    );
  }

  if (!ctx) {
    return (
      <>
        <TopBar title="Lesson" subtitle="Loading…" />
        <div className="p-6">
          <div className="skeleton h-64 rounded" />
        </div>
      </>
    );
  }

  const { item, playlist, task } = ctx;
  const done = task?.status === "completed";

  return (
    <>
      <TopBar
        title={item.title}
        subtitle={[
          playlist?.title,
          task ? `planned ${format(parseKey(task.planned_date), "EEE d MMM")}` : "unscheduled",
          done ? "completed" : "open",
        ]
          .filter(Boolean)
          .join("  ·  ")}
      />

      <div className="grid grid-cols-1 gap-5 p-5 lg:p-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        {/* ------------------------------ main ------------------------------ */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Player */}
          <Card className="overflow-hidden">
            <div className="relative aspect-video w-full bg-black">
              {playable ? (
                <iframe
                  key={playable}
                  src={`https://www.youtube-nocookie.com/embed/${playable}?rel=0&modestbranding=1`}
                  title={item.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 size-full border-0"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-3 text-center">
                  <Play className="size-7 text-text-muted" aria-hidden />
                  <p className="max-w-xs text-[11.5px] leading-relaxed text-text-muted">
                    {item.url
                      ? "This source isn't a YouTube video, so it opens in your browser."
                      : "No video attached to this lesson."}
                  </p>
                  {item.url ? (
                    <Button variant="secondary" size="sm" onClick={() => void openExternal(item.url!)}>
                      <ExternalLink /> Open source
                    </Button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: playlist?.color ?? "var(--text-muted)" }}
                />
                <span className="text-[11px] text-text-muted">{playlist?.title}</span>
                {item.url ? (
                  <button
                    onClick={() => void openExternal(item.url!)}
                    className="text-[11px] text-text-muted underline underline-offset-2 hover:text-accent"
                  >
                    source
                  </button>
                ) : null}
                {playable ? (
                  <button
                    onClick={() =>
                      void openExternal(`https://www.youtube.com/watch?v=${playable}`)
                    }
                    className="text-[11px] text-text-muted underline underline-offset-2 hover:text-accent"
                  >
                    open on YouTube
                  </button>
                ) : null}
              </div>
              <Button
                variant={done ? "secondary" : "primary"}
                size="sm"
                onClick={() => void toggleComplete()}
                disabled={!task}
                title={task ? undefined : "This lesson isn't scheduled"}
              >
                {done ? <Check /> : <Check className="opacity-60" />}
                {done ? "Completed" : "Mark complete"}
              </Button>
            </div>
          </Card>

          {/* Tabs */}
          <Card className="flex min-h-[360px] flex-col">
            <div className="flex items-center gap-0.5 border-b border-border bg-surface-2/35 px-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-2.5 text-[11.5px] transition-colors",
                    tab === id ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                  {id === "quiz" && quizzes.length > 0 ? (
                    <span className="numeric text-[10px] text-text-muted">{quizzes.length}</span>
                  ) : null}
                  {id === "cards" && cards.length > 0 ? (
                    <span className="numeric text-[10px] text-text-muted">{cards.length}</span>
                  ) : null}
                  {tab === id ? (
                    <motion.span
                      layoutId="lesson-tab"
                      className="absolute inset-x-2 -bottom-px h-px bg-accent"
                    />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex-1 p-4">
              {tab === "notes" ? (
                <NotesTab
                  note={note}
                  preview={preview}
                  onClearPreview={() => setPreview(null)}
                  onRestore={() => {
                    if (!preview) return;
                    void (async () => {
                      const restored = await api.restoreNoteVersion(
                        preview.note_id,
                        preview.version,
                      );
                      setNote(restored);
                      setVersions(await api.noteVersions(restored.id));
                      setPreview(null);
                      toast(`v${preview.version} restored as v${restored.version}.`, "success");
                    })();
                  }}
                  draft={draft}
                  onDraft={setDraft}
                  onSave={() => void saveDraft()}
                  onGenerate={() => void generate("generate_note")}
                  busy={busyJob(jobs, "generate_note")}
                  aiReady={aiReady}
                />
              ) : tab === "doubts" ? (
                <DoubtsTab itemId={item.id} aiReady={aiReady} />
              ) : tab === "quiz" ? (
                <QuizTab
                  quizzes={quizzes}
                  onGenerate={() => void generate("generate_quiz")}
                  aiReady={aiReady}
                  busy={busyJob(jobs, "generate_quiz")}
                />
              ) : (
                <CardsTab
                  cards={cards}
                  onGenerate={() => void generate("generate_flashcards")}
                  aiReady={aiReady}
                  busy={busyJob(jobs, "generate_flashcards")}
                />
              )}
            </div>
          </Card>
        </div>

        {/* ------------------------------ rail ------------------------------ */}
        <aside className="flex flex-col gap-4">
          <Card className="p-3.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Generate</p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              <GenButton
                icon={NotebookPen}
                label="Notes"
                job="generate_note"
                jobs={jobs}
                onRun={() => void generate("generate_note")}
              />
              <GenButton
                icon={ListChecks}
                label="Quiz"
                job="generate_quiz"
                jobs={jobs}
                onRun={() => void generate("generate_quiz")}
              />
              <GenButton
                icon={Layers}
                label="Flashcards"
                job="generate_flashcards"
                jobs={jobs}
                onRun={() => void generate("generate_flashcards")}
              />
            </div>
            {!aiReady ? (
              <p className="mt-2.5 text-[10.5px] leading-relaxed text-text-muted">
                Runs in the background once a provider is configured in Settings → AI.
              </p>
            ) : null}
          </Card>

          <Card className="p-3.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-text-muted">
              <History className="size-3" aria-hidden /> Versions
            </p>
            <div className="mt-2 flex flex-col">
              {versions.length === 0 ? (
                <p className="py-1 text-[11px] text-text-muted">No saved notes yet.</p>
              ) : (
                versions.map((v) => {
                  const active = preview ? preview.id === v.id : v.version === note?.version;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setPreview(active && preview ? null : v)}
                      title={`Read v${v.version} (${v.source})`}
                      className={cn(
                        "flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 text-left text-[11px] transition-colors first:border-t-0 hover:text-accent",
                        active ? "text-accent" : "text-text-secondary",
                      )}
                    >
                      <span className="numeric">v{v.version}</span>
                      <span className="truncate text-[10px] text-text-muted">
                        {v.source} · {format(new Date(v.created_at), "d MMM HH:mm")}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {jobs.length > 0 ? (
            <Card className="p-3.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Jobs</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {jobs.slice(0, 4).map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="truncate text-text-secondary">{prettyKind(j.kind)}</span>
                    <JobState job={j} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

/* ------------------------------ notes tab ------------------------------ */

function NotesTab({
  note,
  preview,
  onClearPreview,
  onRestore,
  draft,
  onDraft,
  onSave,
  onGenerate,
  busy,
  aiReady,
}: {
  note: Note | null;
  preview: NoteVersion | null;
  onClearPreview: () => void;
  onRestore: () => void;
  draft: string | null;
  onDraft: (v: string | null) => void;
  onSave: () => void;
  onGenerate: () => void;
  busy: boolean;
  aiReady: boolean;
}) {
  const editing = draft !== null;

  if (!note && !editing) {
    return (
      <EmptyState
        icon={<NotebookPen />}
        title="No notes for this lesson yet"
        description={
          aiReady
            ? "Generate a first draft, then edit it into your own words. Every save keeps a version."
            : "Write your own, or connect a provider to generate a draft."
        }
        action={
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={onGenerate} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate notes
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDraft("")}>
              <SquarePen /> Write
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {preview ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-warning/40 bg-warning-soft px-2.5 py-1.5">
          <p className="text-[10.5px] text-text-secondary">
            Reading <span className="numeric text-warning">v{preview.version}</span> — your saved
            note is unchanged.
          </p>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={onClearPreview}>
              <X /> Back
            </Button>
            <Button size="xs" variant="secondary" onClick={onRestore}>
              <RotateCcw /> Restore
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={note?.source === "ai" ? "accent" : "neutral"}>
            {note?.source === "ai" ? "generated" : note ? "yours" : "draft"}
          </Badge>
          {preview ? (
            <span className="numeric text-[10px] text-warning">viewing v{preview.version}</span>
          ) : note ? (
            <span className="numeric text-[10px] text-text-muted">v{note.version}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <Button size="xs" variant="ghost" onClick={() => onDraft(null)}>
                <X /> Cancel
              </Button>
              <Button size="xs" variant="primary" onClick={onSave}>
                <Check /> Save version
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="ghost" onClick={() => onDraft(note?.body ?? "")}>
                <SquarePen /> Edit
              </Button>
              <Button size="xs" variant="secondary" onClick={onGenerate} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft ?? ""}
          onChange={(e) => onDraft(e.target.value)}
          spellCheck={false}
          aria-label="Note editor"
          className={cn(
            "min-h-[300px] w-full resize-y rounded-[3px] border border-border bg-bg-shade",
            "p-3 font-mono text-[12px] leading-relaxed text-text-secondary",
            "focus-visible:border-border-focus focus-visible:outline-none",
          )}
          placeholder="# Notes&#10;&#10;Write in Markdown. Formulas with $…$ work too."
        />
      ) : (
        <Markdown>{preview?.body ?? note?.body ?? ""}</Markdown>
      )}
    </div>
  );
}

/* ----------------------------- doubts tab ----------------------------- */

function DoubtsTab({ itemId, aiReady }: { itemId: string; aiReady: boolean }) {
  const intro: ChatMessage = {
    role: "assistant",
    content:
      "Ask me anything about this lesson — the idea, the code, or why a step works. I read the video's description, its chapters and its transcript (when YouTube serves captions), so answers stay tied to what the lesson actually says.",
  };
  const [messages, setMessages] = useState<ChatMessage[]>([intro]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // One stored thread per lesson: closing the app does not lose the doubts.
  useEffect(() => {
    let alive = true;
    void api
      .listChat(itemId)
      .then((stored) => {
        if (alive && stored.length > 0) setMessages([intro, ...stored]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const send = async () => {
    const question = text.trim();
    if (!question || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const reply = await api.aiChat([{ role: "user", content: question }], itemId, itemId);
      setMessages([...next, { role: "assistant", content: reply }]);
      setTimeout(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 40);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[340px] flex-col">
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => {
            setError(null);
            setMessages([intro]);
            void api.clearChat(itemId).catch(() => {});
          }}
          className="inline-flex items-center gap-1 text-[10px] text-text-muted transition-colors hover:text-accent"
        >
          <RotateCcw className="size-3" /> new thread
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
            {m.role === "assistant" ? (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[3px] border border-accent/30 bg-accent-soft text-[10px] text-accent">
                FS
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[44ch] rounded-[3px] border px-3 py-2",
                m.role === "user"
                  ? "border-border bg-surface-2 text-text-primary"
                  : "border-border-subtle bg-surface text-text-secondary",
              )}
            >
              {m.role === "assistant" ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <p className="text-[12px] leading-relaxed">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-[11px] text-text-muted">
            <Loader2 className="size-3 animate-spin" /> thinking…
          </p>
        ) : null}
        {error ? (
          <p className="rounded-[3px] border border-danger/40 bg-danger-soft px-2.5 py-2 text-[11px] text-danger">
            {error}
          </p>
        ) : null}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex items-end gap-2 border-t border-border pt-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={aiReady ? "Ask a doubt…" : "Configure a provider to chat"}
          className="min-h-[44px] flex-1 resize-none rounded-[3px] border border-border bg-bg-shade px-2.5 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
        />
        <Button type="submit" variant="primary" size="icon" disabled={busy || !text.trim()}>
          <Send />
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------ quiz tab ------------------------------ */

function QuizTab({
  quizzes,
  onGenerate,
  aiReady,
  busy,
}: {
  quizzes: Quiz[];
  onGenerate: () => void;
  aiReady: boolean;
  busy: boolean;
}) {
  const [active, setActive] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);

  if (!quizzes.length) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="No quiz for this lesson"
        description={aiReady ? "Generate one from the key ideas, then take it here." : "Connect a provider to generate quizzes."}
        action={
          <Button variant="primary" size="sm" onClick={onGenerate} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate quiz
          </Button>
        }
      />
    );
  }

  if (active) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium text-text-primary">{active.title}</p>
          <Button size="xs" variant="ghost" onClick={() => { setActive(null); setScore(null); }}>
            Close
          </Button>
        </div>
        {active.questions.map((q, qi) => (
          <div key={qi} className="rounded-[3px] border border-border-subtle p-3">
            <p className="text-[12px] text-text-primary">
              <span className="numeric mr-2 text-text-muted">{qi + 1}.</span>
              {q.prompt}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {q.choices.map((c, ci) => {
                const picked = answers[qi] === ci;
                const correct = score !== null && ci === q.answer;
                const wrongPick = score !== null && picked && ci !== q.answer;
                return (
                  <button
                    key={ci}
                    onClick={() => {
                      if (score !== null) return;
                      const next = [...answers];
                      next[qi] = ci;
                      setAnswers(next);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
                      correct
                        ? "border-success/60 bg-success-soft text-success"
                        : wrongPick
                          ? "border-danger/50 bg-danger-soft text-danger"
                          : picked
                            ? "border-accent/60 bg-accent-soft text-text-primary"
                            : "border-border text-text-secondary hover:border-border-strong",
                    )}
                  >
                    <span className="numeric text-[10px] text-text-muted">{String.fromCharCode(65 + ci)}</span>
                    {c}
                  </button>
                );
              })}
            </div>
            {score !== null ? (
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{q.why}</p>
            ) : null}
          </div>
        ))}
        {score === null ? (
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              const s = await api.submitQuiz(active.id, answers);
              setScore(s);
              toast(`Scored ${s}/${active.questions.length}.`, "success");
            }}
          >
            Submit answers
          </Button>
        ) : (
          <p className="numeric text-[13px] text-accent">
            {score}/{active.questions.length} correct
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {quizzes.map((q) => (
        <button
          key={q.id}
          onClick={() => {
            setActive(q);
            setAnswers([]);
            setScore(null);
          }}
          className="flex items-center justify-between gap-2 rounded-[3px] border border-border-subtle px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2/60"
        >
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-text-primary">{q.title}</span>
            <span className="text-[10px] text-text-muted">
              {q.total} questions · {format(new Date(q.created_at), "d MMM HH:mm")}
            </span>
          </span>
          <span className="numeric shrink-0 text-[11px] text-text-muted">
            {q.best_score !== null ? `best ${q.best_score}/${q.total}` : "not taken"}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ cards tab ------------------------------ */

function CardsTab({
  cards,
  onGenerate,
  aiReady,
  busy,
}: {
  cards: Flashcard[];
  onGenerate: () => void;
  aiReady: boolean;
  busy: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) {
    return (
      <EmptyState
        icon={<Layers />}
        title="No flashcards yet"
        description={aiReady ? "Generate a deck from this lesson and review it with spaced repetition." : "Connect a provider to generate cards."}
        action={
          <Button variant="primary" size="sm" onClick={onGenerate} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate cards
          </Button>
        }
      />
    );
  }

  const card = cards[index % cards.length]!;

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-[3px] border border-border bg-surface-2/40 p-6 text-center transition-colors hover:border-border-strong"
      >
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {flipped ? "answer" : "question"} · {index + 1}/{cards.length}
        </span>
        <span className="text-[14px] leading-relaxed text-text-primary">
          {flipped ? card.back : card.front}
        </span>
        <span className="mt-1 text-[10px] text-text-muted">click to flip</span>
      </button>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-text-muted">{card.deck} · reviewed {card.reviews}×</span>
        <div className="flex gap-1.5">
          {(["again", "hard", "good", "easy"] as const).map((r) => (
            <Button
              key={r}
              size="xs"
              variant={r === "good" ? "primary" : "secondary"}
              onClick={async () => {
                await api.reviewFlashcard(card.id, r);
                setFlipped(false);
                setIndex((i) => (i + 1) % cards.length);
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- helpers ------------------------------- */

function GenButton({
  icon: Icon,
  label,
  job,
  jobs,
  onRun,
}: {
  icon: typeof FileText;
  label: string;
  job: string;
  jobs: Job[];
  onRun: () => void;
}) {
  const running = jobs.some((j) => j.kind === job && (j.status === "queued" || j.status === "running"));
  return (
    <button
      onClick={onRun}
      disabled={running}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[2px] border px-2.5 py-1.5 text-[11.5px] transition-colors",
        running
          ? "border-border-subtle text-text-muted"
          : "border-border text-text-secondary hover:border-accent/50 hover:bg-accent-soft hover:text-text-primary",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-3.5" aria-hidden /> {label}
      </span>
      {running ? <Loader2 className="size-3 animate-spin text-accent" /> : <Sparkles className="size-3 opacity-40" />}
    </button>
  );
}

function JobState({ job }: { job: Job }) {
  if (job.status === "running" || job.status === "queued") {
    return <Loader2 className="size-3 shrink-0 animate-spin text-accent" />;
  }
  if (job.status === "done") return <Check className="size-3 shrink-0 text-success" />;
  return (
    <span className="shrink-0 text-danger" title={job.error ?? undefined}>
      failed
    </span>
  );
}

function busyJob(jobs: Job[], kind: string) {
  return jobs.some((j) => j.kind === kind && (j.status === "queued" || j.status === "running"));
}

function prettyKind(kind: string) {
  return kind.replace("generate_", "").replace("_", " ");
}

/** YouTube ids are the only URL shape we can embed. */
function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (!u.hostname.includes("youtube")) return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const i = parts.indexOf("embed");
    return i >= 0 ? (parts[i + 1] ?? null) : null;
  } catch {
    return null;
  }
}
