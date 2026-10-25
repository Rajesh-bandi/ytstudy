import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  Layers,
  ListChecks,
  ListVideo,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/services/api";
import type { ArtifactSummary, OrderingPolicy, Playlist, PlaylistItem, TaskType } from "@/types";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, ProgressBar, SectionHeader } from "@/components/ui/badge";
import { EmptyState, TaskListSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function Playlists() {
  const params = useParams();
  const selectedId = params.id ?? null;

  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[] | null>(null);
  const navigate = useNavigate();

  const loadList = useCallback(async () => {
    setPlaylists(await api.listPlaylists());
  }, []);

  const loadSelected = useCallback(async (id: string) => {
    const list = await api.listPlaylists();
    const pl = list.find((p) => p.id === id) ?? null;
    setSelected(pl);
    setItems(pl ? await api.listItems(id) : null);
  }, []);

  useEffect(() => {
    if (selectedId) void loadSelected(selectedId);
    else void loadList();
  }, [selectedId, loadSelected, loadList]);

  return (
    <>
      <TopBar
        title={selected ? selected.title : "Playlists"}
        subtitle={selected ? undefined : "Import, configure and organize learning sources"}
      />
      <div className="p-6">
        {!selectedId ? (
          <PlaylistGrid
            playlists={playlists!}
            onImportDone={async (id) => {
              await loadList();
              navigate(`/playlists/${id}`);
            }}
          />
        ) : selected === null || items === null ? (
          <TaskListSkeleton rows={5} />
        ) : (
          <PlaylistDetail
            playlist={selected}
            items={items}
            onBack={() => navigate("/playlists")}
            onChanged={async () => {
              await loadList();
              await loadSelected(selected.id);
            }}
          />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ grid */

function PlaylistGrid({
  playlists,
  onImportDone,
}: {
  playlists: Playlist[];
  onImportDone: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <SectionHeader title="Your playlists" />
        <ImportDialog onImported={onImportDone} />
      </div>
      {playlists == null ? (
        <GridSkeleton />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon={<ListVideo />}
          title="No playlists yet"
          description="Import a YouTube playlist or create one manually to begin scheduling."
          action={<ImportDialog onImported={onImportDone} triggerLabel="Add first playlist" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playlists.map((p, i) => (
            <PlaylistCard key={p.id} playlist={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistCard({ playlist, index }: { playlist: Playlist; index: number }) {
  const navigate = useNavigate();
  const rate = playlist.item_count ? playlist.completed_count / playlist.item_count : 0;
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/playlists/${playlist.id}`)}
      className="panel lift group relative flex flex-col gap-3 overflow-hidden rounded-lg p-4 text-left hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      {/* Identity stripe: the playlist's own Gruvbox hue */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{
          background: `linear-gradient(90deg, ${(playlist.color ?? "var(--accent)") as string}, transparent)`,
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-bold transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] group-hover:scale-105"
          style={{
            background: `color-mix(in oklab, ${(playlist.color ?? "var(--accent)") as string} 22%, var(--surface-2))`,
            color: (playlist.color ?? "var(--accent)") as string,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${(playlist.color ?? "var(--accent)") as string} 40%, transparent)`,
          }}
          aria-hidden
        >
          {playlist.title.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col items-end gap-1.5">
          <span className="numeric text-lg font-semibold leading-none text-text-primary">
            {Math.round(rate * 100)}%
          </span>
          <Badge tone={playlist.ordering_policy === "strict" ? "info" : "neutral"}>
            {playlist.ordering_policy}
          </Badge>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-primary">{playlist.title}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">
          <span className="numeric">
            {playlist.completed_count}/{playlist.item_count}
          </span>{" "}
          items · {playlist.daily_target}/day · {playlist.task_type}
        </p>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        <ProgressBar value={rate} />
        <span className="text-[10px] text-text-muted">
          {Math.max(0, playlist.item_count - playlist.completed_count)} left to finish
        </span>
      </div>
    </motion.button>
  );
}

function ArtifactIcon({
  on,
  label,
  icon,
}: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "flex size-5 items-center justify-center rounded-[2px] border transition-colors",
        on
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-border-subtle text-text-muted/40",
      )}
    >
      {icon}
    </span>
  );
}

/* ---------------------------------------------------------------- detail */

function PlaylistDetail({
  playlist,
  items,
  onBack,
  onChanged,
}: {
  playlist: Playlist;
  items: PlaylistItem[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(playlist.title);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => setName(playlist.title), [playlist.title]);

  const addItem = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await api.addItem(playlist.id, {
        title,
        url: newUrl.trim() || null,
        source_item_id: null,
      });
      setNewTitle("");
      setNewUrl("");
      await onChanged();
      toast("Item added.", "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setAdding(false);
    }
  }, [newTitle, newUrl, playlist.id, onChanged]);

  const saveHeader = useCallback(
    async (patch: Partial<Playlist>) => {
      await api.updatePlaylist(playlist.id, patch);
      await onChanged();
      toast("Playlist updated.", "success");
    },
    [playlist.id, onChanged],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await api.deleteItem(id);
      await onChanged();
      toast("Item removed.", "info");
    },
    [onChanged],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to playlists">
          <ArrowLeft /> All playlists
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Title" className="min-w-[220px] flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name !== playlist.title && name.trim()) void saveHeader({ title: name.trim() });
                }}
              />
            </Field>
            <Field label="Daily target" hint="">
              <Input
                type="number"
                min={1}
                max={20}
                value={playlist.daily_target}
                onChange={(e) =>
                  void saveHeader(
                    { daily_target: Math.max(1, Math.min(20, Number(e.target.value) || 1)) },
                  )
                }
                className="w-24"
                aria-label="Daily target"
              />
            </Field>
            <Field label="Ordering">
              <Select
                value={playlist.ordering_policy}
                onChange={(e) => void saveHeader({ ordering_policy: e.target.value as OrderingPolicy })}
                aria-label="Ordering policy"
              >
                <option value="strict">Strict sequence</option>
                <option value="flexible">Flexible</option>
              </Select>
            </Field>
            <Field label="Type">
              <Select
                value={playlist.task_type}
                onChange={(e) => void saveHeader({ task_type: e.target.value as TaskType })}
                aria-label="Task type"
              >
                <option value="video">Video</option>
                <option value="coding">Coding problems</option>
                <option value="theory">Theory</option>
                <option value="mixed">Mixed</option>
              </Select>
            </Field>
            <Field label="Plan">
              <Select
                value={playlist.planning_mode}
                onChange={(e) =>
                  void saveHeader({ planning_mode: e.target.value as Playlist["planning_mode"] })
                }
                aria-label="Planning mode"
              >
                <option value="sequential">Sequential</option>
                <option value="ai">Companion order</option>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Manual entry: playlists assembled by hand still need a way in. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addItem();
        }}
        className="flex flex-wrap items-center gap-2 rounded-[3px] border border-border-subtle bg-surface-2/35 p-2"
      >
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a lesson or problem…"
          aria-label="New item title"
          className="h-8 min-w-[200px] flex-1"
        />
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://… (optional)"
          aria-label="New item URL"
          spellCheck={false}
          className="h-8 min-w-[180px] flex-1 font-mono text-[11px]"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!newTitle.trim() || adding}>
          <Plus /> {adding ? "Adding…" : "Add"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title={`Items (${items.length})`} />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={playlist.ordering_policy === "strict"}
            title={
              playlist.ordering_policy === "strict"
                ? "Strict playlists keep their sequence, because the order is the course. Switch Ordering to flexible first."
                : "Group unfinished items by topic and ramp difficulty; the schedule is rebuilt after."
            }
            onClick={async () => {
              try {
                const r = await api.aiReorderPlaylist(playlist.id);
                await onChanged();
                toast(r.note, "success");
              } catch (e) {
                toast(String(e), "error");
              }
            }}
          >
            <Sparkles /> Order with companion
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const d = await api.rebuildSchedule(playlist.id);
              await onChanged();
              toast(d.added ? `Plan updated — ${d.added} new tasks.` : "Schedule already covers the horizon.", "success");
            }}
          >
            <Download /> Heal schedule
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ListVideo />} title="No items in this playlist" />
      ) : (
        <div className="flex flex-col overflow-visible rounded-lg border border-border">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                last={it.id === items[items.length - 1]!.id}
                onChanged={onChanged}
                onDelete={removeItem}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* Modification guard: item rows stay persistently draggable for manual
   editing; strict ordering only applies to the *planner*, so this page
   may need repositioning regardless of policy. */
function ItemRow({
  item,
  last,
  onChanged,
  onDelete,
}: {
  item: PlaylistItem;
  last: boolean;
  onChanged: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [arts, setArts] = useState<ArtifactSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void api
      .getArtifacts(item.id)
      .then((a) => alive && setArts(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [item.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "flex items-center gap-3 bg-surface px-4 py-2.5 transition-colors hover:bg-surface-hover",
        !last && "border-b border-border",
      )}
    >
      <GripVertical className="size-3.5 text-text-muted" aria-hidden />
      <span className="w-6 text-right text-[11px] tabular-nums text-text-muted">
        {item.position + 1}
      </span>
      <Link
        to={`/learn/${item.id}`}
        className={cn(
          "min-w-0 flex-1 truncate text-[12.5px] transition-colors hover:text-accent hover:underline underline-offset-2",
          item.completed ? "text-text-muted line-through" : "text-text-primary",
        )}
      >
        {item.title}
      </Link>

      {/* Artifacts for this lesson, in a row: note · quizzes · cards */}
      <span className="flex shrink-0 items-center gap-2">
        <ArtifactIcon
          on={arts?.has_note ?? false}
          label={arts?.has_note ? "Notes ready" : "No notes yet"}
          icon={<FileText className="size-3" />}
        />
        <ArtifactIcon
          on={(arts?.quizzes ?? 0) > 0}
          label={(arts?.quizzes ?? 0) > 0 ? `${arts?.quizzes} quiz` : "No quiz yet"}
          icon={<ListChecks className="size-3" />}
        />
        <ArtifactIcon
          on={(arts?.cards ?? 0) > 0}
          label={(arts?.cards ?? 0) > 0 ? `${arts?.cards} cards` : "No cards yet"}
          icon={<Layers className="size-3" />}
        />
      </span>

      {item.completed ? <Badge tone="success">done</Badge> : null}
      {!last ? (
      <ButtonIcon
        onClick={async () => {
          await api.reorderItem(item.id, item.position + 1);
          await onChanged();
        }}
          label="Move up"
        >
          <MoreHorizontal className="rotate-90" />
        </ButtonIcon>
      ) : null}
      <ButtonIcon
        onClick={() => void onDelete(item.id)}
        label="Delete item"
        danger
      >
        <Trash2 />
      </ButtonIcon>
    </motion.div>
  );
}

// Lock affordance is a placeholder until per-item locking ships with
// the planner phase.
function ButtonIcon({
  onClick,
  label,
  children,
  danger,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          "rounded p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary",
          danger && "hover:text-danger",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((n) => (
        <div key={n} className="skeleton h-32 rounded-lg" />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- import */

function ImportDialog({
  onImported,
  triggerLabel = "Import playlist",
}: {
  onImported: (id: string) => Promise<void>;
  triggerLabel?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"import" | "manual">("import");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(2);
  const [policy, setPolicy] = useState<OrderingPolicy>("strict");
  const [aiPlan, setAiPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = mode === "import" ? url.trim().length > 0 : title.trim().length > 0;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const useAi = aiPlan && policy === "flexible";
      let pl: Playlist;
      if (mode === "import") {
        pl = await api.importPlaylist({
          url: url.trim(),
          title: title.trim() || undefined,
          dailyTarget: target,
          orderingPolicy: policy,
        });
        toast(`Imported ${pl.item_count} items.`, "success");
      } else {
        pl = await api.createPlaylist({
          title: title.trim(),
          daily_target: target,
          ordering_policy: policy,
          task_type: "mixed",
          source_type: "manual",
          planning_mode: useAi ? "ai" : "sequential",
        });
      }

      if (useAi) {
        await api.updatePlaylist(pl.id, { planning_mode: "ai" });
        try {
          const r = await api.aiReorderPlaylist(pl.id);
          toast(r.note, "success");
        } catch (e) {
          toast(String(e), "error");
        }
      }

      setOpen(false);
      await onImported(pl.id);
      navigate(`/playlists/${pl.id}`);
    } catch (e) {
      // Keep the dialog open and the typed values intact: a failed fetch
      // should lead to "create it by hand", not to redoing the whole form.
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [mode, url, title, target, policy, aiPlan, onImported, navigate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus /> {triggerLabel}
      </Button>
      <DialogContent
        title="Add a playlist"
        description="Pull lessons from a YouTube playlist URL, or start an empty one you'll fill in by hand."
      >
        <div className="mb-4 flex rounded-md border border-border bg-surface-2 p-0.5">
          {(
            [
              ["import", "From YouTube"],
              ["manual", "Manual"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setMode(val)}
              aria-pressed={mode === val}
              className={cn(
                "flex-1 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors",
                mode === val ? "bg-surface text-text-primary shadow-sm" : "text-text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {mode === "import" ? (
            <Field label="Playlist URL">
              <Input
                autoFocus
                placeholder="https://youtube.com/playlist?list=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Title" hint="Optional">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DSA, Terraform…" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Per day">
              <Input
                type="number"
                min={1}
                max={20}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </Field>
            <Field label="Ordering">
              <Select
                value={policy}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setPolicy(e.target.value === "flexible" ? "flexible" : "strict")
                }
                aria-label="Ordering"
              >
                <option value="strict">Strict</option>
                <option value="flexible">Flexible</option>
              </Select>
            </Field>
          </div>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-[3px] border px-3 py-2.5 transition-colors",
              policy === "strict"
                ? "cursor-not-allowed border-border-subtle bg-surface-2/30 opacity-55"
                : aiPlan
                  ? "border-accent/45 bg-accent-soft"
                  : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="checkbox"
              checked={aiPlan && policy === "flexible"}
              disabled={policy === "strict"}
              onChange={(e) => setAiPlan(e.target.checked)}
              className="mt-0.5 size-3.5 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[11.5px] text-text-primary">
                <Sparkles className="size-3 text-accent" aria-hidden /> Order with the companion
              </span>
              <span className="text-[10.5px] leading-relaxed text-text-muted">
                {policy === "strict"
                  ? "Strict playlists stay in sequence. Choose Flexible to let the companion cluster by topic and difficulty."
                  : "Groups related problems, ramps difficulty, then builds the daily plan. Needs an AI provider."}
              </span>
            </span>
          </label>

          {error ? (
            <div className="rounded-[3px] border border-danger/40 bg-danger-soft px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-danger">{error}</p>
              {mode === "import" ? (
                <Button
                  variant="secondary"
                  size="xs"
                  className="mt-2"
                  onClick={() => {
                    setError(null);
                    setMode("manual");
                  }}
                >
                  Create it manually instead
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-1 flex justify-end">
            <Button variant="primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
              {busy ? "Working…" : mode === "import" ? "Import" : "Create"}
            </Button>
          </div>
          {mode === "import" ? (
            <p className="text-[11px] leading-relaxed text-text-muted">
              Best effort: the app fetches the playlist and lists its videos. If a fetch is blocked
              (network, region, YouTube change), create it manually or re-run import later.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
