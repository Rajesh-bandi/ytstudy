import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Layers,
  ListChecks,
  ListVideo,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/services/api";
import type {
  ArtifactSummary,
  OrderingPolicy,
  Playlist,
  PlaylistItem,
  TaskType,
} from "@/types";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, ProgressBar } from "@/components/ui/badge";
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
        title={selectedId && selected ? selected.title : "Playlists"}
        subtitle={
          selectedId && selected
            ? `${selected.item_count} items · ${selected.daily_target}/day · ${selected.ordering_policy}`
            : "Library · import, target and sequence your sources"
        }
      />
      <div className="p-5 lg:p-6">
        {!selectedId ? (
          <PlaylistGrid
            playlists={playlists}
            onImportDone={async (id) => {
              await loadList();
              navigate(`/playlists/${id}`);
            }}
          />
        ) : selected === null || items === null ? (
          <div className="flex flex-col gap-4">
            <TaskListSkeleton rows={5} />
          </div>
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

/* ---------------------------------------------------------------- library */

type PolicyFilter = "all" | "strict" | "flexible";

function PlaylistGrid({
  playlists,
  onImportDone,
}: {
  playlists: Playlist[] | null;
  onImportDone: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [policy, setPolicy] = useState<PolicyFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (playlists ?? []).filter((p) => {
      if (policy !== "all" && p.ordering_policy !== policy) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.task_type.toLowerCase().includes(q);
    });
  }, [playlists, query, policy]);

  const empty = playlists !== null && playlists.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <LibrarySummary playlists={playlists} />

      {!empty ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-[4px] border border-border bg-surface px-2.5 transition-colors focus-within:border-accent">
            <Search className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search playlists…"
              aria-label="Search playlists"
              className="h-full w-full bg-transparent text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="rounded-[2px] p-0.5 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </label>

          <div className="flex items-center gap-1">
            {(["all", "strict", "flexible"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setPolicy(value)}
                aria-pressed={policy === value}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] capitalize transition-colors",
                  policy === value
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border text-text-muted hover:border-border-strong hover:text-text-secondary",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <ImportDialog onImported={onImportDone} />
          </div>
        </div>
      ) : null}

      {playlists === null ? (
        <GridSkeleton />
      ) : empty ? (
        <EmptyState
          icon={<ListVideo />}
          title="No playlists yet"
          description="Import a YouTube playlist or create one manually to begin scheduling."
          action={<ImportDialog onImported={onImportDone} triggerLabel="Add first playlist" />}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No playlists match"
          description="Try a different title, or clear the ordering filter."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setPolicy("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[28px_minmax(0,1fr)_120px_64px_16px] gap-3 border-b border-border bg-surface-2/40 px-4 py-2 md:grid">
            <span className="micro text-[9px]">#</span>
            <span className="micro text-[9px]">playlist</span>
            <span className="micro text-[9px]">target</span>
            <span className="micro text-right text-[9px]">done</span>
            <span aria-hidden />
          </div>
          {filtered.map((p, i) => (
            <PlaylistRow key={p.id} playlist={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibrarySummary({ playlists }: { playlists: Playlist[] | null }) {
  const list = playlists ?? [];
  const items = list.reduce((sum, p) => sum + p.item_count, 0);
  const completed = list.reduce((sum, p) => sum + p.completed_count, 0);
  const rate = items > 0 ? completed / items : 0;
  const active = list.filter((p) => p.completed_count < p.item_count).length;
  const targets = list.reduce((sum, p) => sum + p.daily_target, 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <LibraryStat label="playlists" value={playlists === null ? "—" : `${list.length}`} sub={`${active} active`} />
        <LibraryStat
          label="items"
          value={playlists === null ? "—" : `${items}`}
          sub={`${completed} completed`}
        />
        <LibraryStat
          label="daily targets"
          value={playlists === null ? "—" : `${targets}/day`}
          sub="across the library"
        />
        <div className="min-w-0 bg-surface p-3.5">
          <p className="micro">coverage</p>
          <p className="numeric mt-1.5 text-[22px] font-semibold leading-none text-text-primary">
            {playlists === null ? "—" : `${Math.round(rate * 100)}%`}
          </p>
          <ProgressBar value={rate} className="mt-2.5 h-1" tone={rate >= 1 ? "success" : "accent"} />
        </div>
      </div>
    </Card>
  );
}

function LibraryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 bg-surface p-3.5">
      <p className="micro">{label}</p>
      <p className="numeric mt-1.5 text-[22px] font-semibold leading-none text-text-primary">
        {value}
      </p>
      <p className="micro mt-2 truncate">{sub}</p>
    </div>
  );
}

function PlaylistRow({ playlist, index }: { playlist: Playlist; index: number }) {
  const navigate = useNavigate();
  const rate = playlist.item_count ? playlist.completed_count / playlist.item_count : 0;
  const color = playlist.color ?? "var(--accent)";

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/playlists/${playlist.id}`)}
      className={cn(
        "group grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left",
        "border-b border-border last:border-b-0 md:grid-cols-[28px_minmax(0,1fr)_120px_64px_16px]",
        "transition-colors duration-(--duration-fast) hover:bg-surface-2/55",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-border-focus",
      )}
    >
      <span className="numeric self-start pt-0.5 text-[9.5px] text-text-muted">
        {String(index + 1).padStart(2, "0")}
      </span>

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-[2px] shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="truncate text-[12.5px] font-medium text-text-primary">
            {playlist.title}
          </span>
          <Badge
            tone={playlist.ordering_policy === "strict" ? "info" : "neutral"}
            className="hidden sm:inline-flex"
          >
            {playlist.ordering_policy}
          </Badge>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[9.5px] text-text-muted">
          <span>{playlist.task_type}</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>{playlist.item_count} items</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span className="md:hidden">{playlist.daily_target}/day</span>
          <span className="hidden md:inline">{playlist.planning_mode === "ai" ? "companion order" : "sequential"}</span>
        </span>
        <ProgressBar value={rate} className="mt-0.5 h-1" />
      </span>

      <span className="hidden font-mono text-[9.5px] text-text-muted md:block">
        {playlist.daily_target}/day
      </span>

      <span className="flex items-baseline justify-end gap-1">
        <span className="numeric text-[14px] font-semibold text-text-primary">
          {Math.round(rate * 100)}
        </span>
        <span className="font-mono text-[9px] text-text-muted">%</span>
      </span>

      <ChevronRight
        aria-hidden
        className="hidden size-3.5 text-text-muted transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-accent md:block"
      />
    </motion.button>
  );
}

function GridSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="border-b border-border p-4 last:border-b-0">
          <div className="skeleton h-10 rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- detail */

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
  const [target, setTarget] = useState(String(playlist.daily_target));
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(playlist.title), [playlist.title]);
  useEffect(() => setTarget(String(playlist.daily_target)), [playlist.daily_target]);

  const done = items.filter((i) => i.completed).length;
  const rate = items.length > 0 ? done / items.length : 0;

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

  const reorder = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.aiReorderPlaylist(playlist.id);
      await onChanged();
      toast(r.note, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }, [playlist.id, onChanged]);

  const heal = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.rebuildSchedule(playlist.id);
      await onChanged();
      toast(
        d.added ? `Plan updated — ${d.added} new tasks.` : "Schedule already covers the horizon.",
        "success",
      );
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }, [playlist.id, onChanged]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to playlists">
          <ArrowLeft /> Library
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || playlist.ordering_policy === "strict"}
            title={
              playlist.ordering_policy === "strict"
                ? "Strict playlists keep their sequence, because order is the course. Switch Ordering to flexible first."
                : "Group unfinished items by topic and ramp difficulty; the schedule is rebuilt after."
            }
            onClick={() => void reorder()}
          >
            <Sparkles /> Order with companion
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void heal()}>
            <Download /> Heal schedule
          </Button>
        </div>
      </div>

      {/* Identity + progress + configuration */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="micro">playlist</p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name !== playlist.title && name.trim()) void saveHeader({ title: name.trim() });
                }}
                aria-label="Playlist title"
                className="mt-1 h-9 max-w-[440px] border-transparent bg-transparent px-0 text-[18px] font-semibold tracking-[-0.02em] hover:border-border hover:bg-surface focus:bg-surface"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={playlist.ordering_policy === "strict" ? "info" : "neutral"}>
                  {playlist.ordering_policy === "strict" ? "strict sequence" : "flexible"}
                </Badge>
                <Badge tone="neutral">{playlist.task_type}</Badge>
                <Badge tone="neutral">
                  {playlist.planning_mode === "ai" ? "companion order" : "sequential"}
                </Badge>
                <span className="font-mono text-[9.5px] text-text-muted">
                  {items.length} items · {done} done
                </span>
              </div>
            </div>

            <div className="flex items-end gap-4">
              <div className="text-right">
                <p className="numeric text-[30px] font-semibold leading-none text-text-primary">
                  {Math.round(rate * 100)}
                  <span className="text-[13px] font-normal text-text-muted">%</span>
                </p>
                <p className="micro mt-1">complete</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="micro">
                {done}/{items.length} items
              </span>
              <span className="micro">{Math.max(0, items.length - done)} left</span>
            </div>
            <ProgressBar value={rate} className="h-1.5" tone={rate >= 1 ? "success" : "accent"} />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 md:grid-cols-4">
            <Field label="Daily target" hint="Per day">
              <Input
                type="number"
                min={1}
                max={20}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onBlur={() => {
                  const next = Math.max(1, Math.min(20, Number(target) || 1));
                  setTarget(String(next));
                  // Commit once, on blur — typing "12" must not rebuild the
                  // whole schedule for "1" and then "12".
                  if (next !== playlist.daily_target) void saveHeader({ daily_target: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="w-full"
                aria-label="Daily target"
              />
            </Field>
            <Field label="Ordering">
              <Select
                value={playlist.ordering_policy}
                onChange={(e) =>
                  void saveHeader({ ordering_policy: e.target.value as OrderingPolicy })
                }
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

      {/* Manual entry */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addItem();
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2.5"
      >
        <span className="micro hidden w-16 shrink-0 pl-1 sm:block">add item</span>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="A lesson, problem or chapter…"
          aria-label="New item title"
          className="h-8 min-w-[180px] flex-1"
        />
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://… (optional)"
          aria-label="New item URL"
          spellCheck={false}
          className="h-8 min-w-[160px] flex-1 font-mono text-[11px]"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!newTitle.trim() || adding}>
          <Plus /> {adding ? "Adding…" : "Add"}
        </Button>
      </form>

      {/* Items ledger */}
      <div className="flex items-center justify-between gap-2">
        <p className="micro flex items-center gap-2">
          <span aria-hidden className="h-px w-3 bg-border-strong" />
          items ({items.length})
        </p>
        <span className="micro">
          {done} done · {Math.max(0, items.length - done)} open
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ListVideo />}
          title="No items in this playlist"
          description="Add a lesson above, or import a YouTube playlist to fill it automatically."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[28px_minmax(0,1fr)_84px_104px] gap-3 border-b border-border bg-surface-2/40 px-4 py-2 md:grid">
            <span className="micro text-[9px]">#</span>
            <span className="micro text-[9px]">lesson</span>
            <span className="micro text-[9px]">artifacts</span>
            <span className="micro text-right text-[9px]">actions</span>
          </div>
          <AnimatePresence initial={false}>
            {items.map((it, i) => (
              <ItemRow
                key={it.id}
                item={it}
                last={i === items.length - 1}
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
        "flex size-[18px] items-center justify-center rounded-[2px] border transition-colors",
        on
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-border-subtle text-text-muted/35",
      )}
    >
      {icon}
    </span>
  );
}

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
      className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2 transition-colors last:border-b-0 hover:bg-surface-2/40 md:grid-cols-[28px_minmax(0,1fr)_84px_104px]"
    >
      <span className="numeric text-[9.5px] text-text-muted">{item.position + 1}</span>

      <span className="flex min-w-0 items-center gap-2">
        <Link
          to={`/learn/${item.id}`}
          className={cn(
            "min-w-0 truncate text-[12px] transition-colors hover:text-accent hover:underline underline-offset-2",
            item.completed ? "text-text-muted line-through" : "text-text-primary",
          )}
          title={item.title}
        >
          {item.title}
        </Link>
        {item.completed ? <Badge tone="success">done</Badge> : null}
      </span>

      <span className="hidden items-center gap-1.5 md:flex">
        <ArtifactIcon
          on={arts?.has_note ?? false}
          label={arts?.has_note ? "Notes ready" : "No notes yet"}
          icon={<FileText className="size-2.5" />}
        />
        <ArtifactIcon
          on={(arts?.quizzes ?? 0) > 0}
          label={(arts?.quizzes ?? 0) > 0 ? `${arts?.quizzes} quiz` : "No quiz yet"}
          icon={<ListChecks className="size-2.5" />}
        />
        <ArtifactIcon
          on={(arts?.cards ?? 0) > 0}
          label={(arts?.cards ?? 0) > 0 ? `${arts?.cards} cards` : "No cards yet"}
          icon={<Layers className="size-2.5" />}
        />
      </span>

      <span className="flex items-center justify-end gap-0.5">
        <ButtonIcon
          label="Move up"
          disabled={item.position === 0}
          onClick={async () => {
            await api.reorderItem(item.id, item.position - 1);
            await onChanged();
          }}
        >
          <ChevronUp />
        </ButtonIcon>
        <ButtonIcon
          label="Move down"
          disabled={last}
          onClick={async () => {
            await api.reorderItem(item.id, item.position + 1);
            await onChanged();
          }}
        >
          <ChevronDown />
        </ButtonIcon>
        <ButtonIcon onClick={() => void onDelete(item.id)} label="Delete item" danger>
          <Trash2 />
        </ButtonIcon>
      </span>
    </motion.div>
  );
}

function ButtonIcon({
  onClick,
  label,
  children,
  danger,
  disabled,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "rounded-[3px] p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary",
          danger && "hover:text-danger",
          disabled && "pointer-events-none opacity-25",
        )}
      >
        {children}
      </button>
    </Tooltip>
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
      // `onImported` refreshes the list and navigates to the new playlist.
      await onImported(pl.id);
    } catch (e) {
      // Keep the dialog open and the typed values intact: a failed fetch
      // should lead to "create it by hand", not to redoing the whole form.
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [mode, url, title, target, policy, aiPlan, onImported]);

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
                "flex-1 rounded-[3px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                mode === val
                  ? "bg-surface text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
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
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="DSA, Terraform…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per day">
              <Input
                type="number"
                min={1}
                max={20}
                value={target}
                onChange={(e) =>
                  setTarget(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                }
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
