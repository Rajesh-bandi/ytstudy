import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, NotebookPen, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { api } from "@/services/api";
import type { Note, NoteVersion } from "@/types";
import { format } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown/markdown";
import { EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function Notes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [preview, setPreview] = useState<NoteVersion | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      const list = await api.listNotes();
      setNotes(list);
      setSelectedId(list[0]?.id ?? null);
    })();
  }, []);

  const selected = notes?.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    // Changing note drops any old-version preview, so the pane never shows a
    // version that belongs to a different lesson.
    setPreview(null);
    void api.noteVersions(selected.id).then(setVersions);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes ?? [];
    return (notes ?? []).filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.item_title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, query]);

  return (
    <>
      <TopBar
        title="Notes"
        subtitle={
          notes ? `${notes.length} notes · versioned on every save` : "Loading your notes"
        }
      />
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Library */}
        <div className="border-b border-border lg:h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-border bg-bg/95 p-2.5 backdrop-blur">
            <label className="flex items-center gap-2 rounded-[2px] border border-border px-2 py-1.5 focus-within:border-border-focus">
              <Search className="size-3 text-text-muted" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="w-full bg-transparent text-[11.5px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </label>
          </div>

          {notes === null ? (
            <div className="p-3">
              <div className="skeleton h-24 rounded" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-[11px] text-text-muted">No notes match that search.</p>
          ) : (
            <ul>
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border-subtle px-3 py-2.5 text-left transition-colors",
                      selectedId === n.id
                        ? "bg-surface-2 text-text-primary"
                        : "text-text-secondary hover:bg-surface-2/50",
                    )}
                  >
                    <span className="truncate text-[12px]">{n.item_title}</span>
                    <span className="flex items-center gap-2 text-[10px] text-text-muted">
                      <span className="numeric">v{n.version}</span>
                      <span>·</span>
                      <span>{format(new Date(n.updated_at), "d MMM HH:mm")}</span>
                      {n.source === "ai" ? <Badge tone="accent">ai</Badge> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reading pane */}
        <div className="p-5 lg:h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:p-6">
          {notes !== null && notes.length === 0 ? (
            <EmptyState
              icon={<NotebookPen />}
              title="No notes yet"
              description="Open a lesson and generate or write notes; they all land here."
            />
          ) : !selected ? (
            <div className="skeleton h-64 rounded" />
          ) : (
            <div className="flex flex-col gap-5">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-medium tracking-[-0.02em] text-text-primary">
                    {selected.item_title}
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-[10.5px] text-text-muted">
                    <span className="numeric">
                      {preview ? `v${preview.version} · read-only` : `v${selected.version}`}
                    </span>
                    <span>·</span>
                    <span>{format(new Date(selected.updated_at), "d MMM yyyy, HH:mm")}</span>
                    <span>·</span>
                    <span>{selected.source}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {preview ? (
                    <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                      <X /> Back to current
                    </Button>
                  ) : null}
                  <Link to={`/learn/${selected.item_id}`}>
                    <Button variant="secondary" size="sm">
                      <Sparkles /> Open lesson
                    </Button>
                  </Link>
                </div>
              </header>

              {preview ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-warning/40 bg-warning-soft px-3 py-2">
                  <p className="text-[11px] text-text-secondary">
                    Reading <span className="numeric text-warning">v{preview.version}</span> — saved
                    notes are untouched until you restore it.
                  </p>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={async () => {
                      const restored = await api.restoreNoteVersion(preview.note_id, preview.version);
                      setNotes(await api.listNotes());
                      setSelectedId(restored.id);
                      setVersions(await api.noteVersions(restored.id));
                      setPreview(null);
                      toast(`v${preview.version} restored as v${restored.version}.`, "success");
                    }}
                  >
                    <RotateCcw /> Restore this version
                  </Button>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_180px]">
                <Markdown>{preview?.body ?? selected.body}</Markdown>

                <aside className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-text-muted">
                    <History className="size-3" aria-hidden /> Versions
                  </p>
                  {versions.map((v) => {
                    const active = preview
                      ? preview.id === v.id
                      : v.version === selected.version;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setPreview(active && preview ? null : v)}
                        title={`Read v${v.version} (${v.source})`}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-[2px] px-1.5 py-1 text-left text-[10.5px] transition-colors",
                          active
                            ? "bg-surface-2 text-text-primary shadow-[inset_0_0_0_1px_var(--border-strong)]"
                            : "text-text-muted hover:bg-surface-2/60 hover:text-accent",
                        )}
                      >
                        <span className="numeric">v{v.version}</span>
                        <span className="truncate">{v.source}</span>
                      </button>
                    );
                  })}
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
