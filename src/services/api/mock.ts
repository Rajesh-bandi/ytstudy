/* Browser-dev mock backend. Mirrors the Rust command surface so every
   screen is fully interactive without the desktop shell. Only active
   when the Tauri runtime is unavailable. */
import type {
  AiConfig,
  AppSettings,
  ChatMessage,
  DayPlan,
  Flashcard,
  Job,
  Note,
  NoteVersion,
  Playlist,
  PlaylistItem,
  Quiz,
  ScheduledTask,
  StreakStats,
} from "@/types";
import { DEFAULT_AI_CONFIG, DEFAULT_SETTINGS } from "@/types";
import { addDays, formatDateKey, today } from "@/lib/date";

const COLORS = ["#d65d0e", "#b16286", "#458588", "#98971a", "#d79921", "#689d6a"];

let idc = 0;
const uid = (p: string) => `${p}_mock_${(++idc).toString(36).padStart(4, "0")}`;

interface MockNote {
  id: string;
  item_id: string;
  playlist_id: string | null;
  item_title: string;
  title: string;
  body: string;
  source: string;
  version: number;
  updated_at: string;
}

interface MockDb {
  playlists: Playlist[];
  items: PlaylistItem[];
  tasks: ScheduledTask[];
  completions: { task_id: string; completed_at: string }[];
  settings: AppSettings;
  notes: MockNote[];
  versions: { id: string; note_id: string; version: number; body: string; source: string; created_at: string }[];
  ai: AiConfig;
  jobs: Job[];
  quizzes: Quiz[];
  cards: Flashcard[];
  reviews: { card_id: string; rating: string; reviewed_at: string }[];
  chats: Record<string, ChatMessage[]>;
}

const db: MockDb = {
  playlists: [],
  items: [],
  tasks: [],
  completions: [],
  settings: { ...DEFAULT_SETTINGS },
  notes: [],
  versions: [],
  ai: { ...DEFAULT_AI_CONFIG },
  jobs: [],
  quizzes: [],
  cards: [],
  reviews: [],
  chats: {},
};

let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const pl = (
    title: string,
    taskType: Playlist["task_type"],
    target: number,
    policy: Playlist["ordering_policy"],
    n = 24,
  ): Playlist => {
    const playlist: Playlist = {
      id: uid("pl"),
      title,
      source_url: null,
      source_type: "manual",
      task_type: taskType,
      daily_target: target,
      max_daily_items: null,
      ordering_policy: policy,
      planning_mode: "sequential",
      color: COLORS[db.playlists.length % COLORS.length] ?? null,
      created_at: new Date(now - 86400000 * 30).toISOString(),
      item_count: n,
      completed_count: 0,
    };
    db.playlists.push(playlist);
    const hour = 4 * (3600 + Math.floor(Math.random() * 1800));
    for (let i = 0; i < n; i++) {
      db.items.push({
        id: uid("it"),
        playlist_id: playlist.id,
        source_item_id: null,
        title: `${title} — lesson ${i + 1}`,
        url: `https://example.com/watch?v=${playlist.id.slice(-3)}${i}`,
        position: i,
        topic: null,
        difficulty: null,
        duration_seconds: hour,
        completed: false,
      });
    }
    // fabricate two weeks of history with gaps for realistic analytics
    for (let d = -13; d <= -1; d++) {
      if (Math.random() > 0.35) {
        const count = Math.min(target, 1 + Math.floor(Math.random() * target));
        for (let c = 0; c < count; c++) {
          const position = target * (-d - 1) + c;
          const item = db.items.filter((x) => x.playlist_id === playlist.id)[position];
          if (!item) continue;
          item.completed = true;
          const dt = new Date(now + d * 86400000);
          dt.setHours(9 + c, 30, 0, 0);
          const task: ScheduledTask = {
            id: uid("t"),
            item_id: item.id,
            playlist_id: playlist.id,
            playlist_title: playlist.title,
            playlist_color: playlist.color,
            item_title: item.title,
            item_url: item.url,
            planned_date: formatDateKey(dt),
            status: "completed",
            locked: false,
            office_position: c,
            item_difficulty: item.difficulty,
            item_topic: item.topic,
            playlist_policy: playlist.ordering_policy,
          };
          db.tasks.push(task);
          db.completions.push({ task_id: task.id, completed_at: dt.toISOString() });
          playlist.completed_count++;
        }
      }
    }
    return playlist;
  };

  pl("NeetCode 150", "coding", 3, "strict");
  pl("Terraform for Beginners", "video", 2, "strict");
  pl("Systems Design Primer", "theory", 1, "flexible");
}

function plannedTargets(): void {
  seed();
  const day = formatDateKey(today());
  if (db.tasks.some((t) => t.planned_date >= day && t.status === "pending")) return;
  for (const playlist of db.playlists) {
    const items = db.items
      .filter((it) => it.playlist_id === playlist.id && !it.completed)
      .sort((a, b) => a.position - b.position)
      .slice(0, playlist.daily_target);
    items.forEach((it, i) => {
      db.tasks.push({
        id: uid("t"),
        item_id: it.id,
        playlist_id: playlist.id,
        playlist_title: playlist.title,
        playlist_color: playlist.color,
        item_title: it.title,
        item_url: it.url,
        planned_date: day,
        status: "pending",
        locked: false,
        office_position: i,
        item_difficulty: it.difficulty,
        item_topic: it.topic,
        playlist_policy: playlist.ordering_policy,
      });
    });
  }
}

function sortTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort(
    (a, b) =>
      a.planned_date.localeCompare(b.planned_date) || a.office_position - b.office_position,
  );
}

function dayPlan(date: string): DayPlan {
  return { date, tasks: sortTasks(db.tasks.filter((t) => t.planned_date === date)) };
}

function streakStats(): StreakStats {
  const days = new Set(db.completions.map((c) => formatDateKey(new Date(c.completed_at))));
  let current = 0;
  // count back from today; allow the run to start today or yesterday
  let d = days.size === 0 ? -999999 : 0;
  if (days.has(formatDateKey(today()))) {
    d = 0;
  } else if (days.has(formatDateKey(addDays(new Date(), -1)))) {
    d = -1;
  } else {
    d = -999999;
  }
  while (d > -365) {
    if (days.has(formatDateKey(addDays(new Date(), d)))) current++;
    else break;
    d--;
  }
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (!prev) {
      run = 1;
    } else {
      const diff = (new Date(day).getTime() - new Date(prev).getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    }
    best = Math.max(best, run);
    prev = day;
  }
  return {
    current_streak: current,
    best_streak: Math.max(best, current),
    qualifying_days_total: days.size,
    last_completed_date: sorted[sorted.length - 1] ?? null,
  };
}

export async function mockInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  plannedTargets();
  switch (cmd) {
    case "list_playlists":
      return db.playlists;

    case "create_playlist": {
      const p = args?.playlist as Partial<Playlist> & { title: string };
      const playlist: Playlist = {
        id: uid("pl"),
        title: p.title,
        source_url: p.source_url ?? null,
        source_type: (p.source_type as Playlist["source_type"]) ?? "manual",
        task_type: (p.task_type as Playlist["task_type"]) ?? "mixed",
        daily_target: p.daily_target ?? 1,
        max_daily_items: null,
        ordering_policy: (p.ordering_policy as Playlist["ordering_policy"]) ?? "strict",
        planning_mode: (p.planning_mode as Playlist["planning_mode"]) ?? "sequential",
        color: COLORS[db.playlists.length % COLORS.length] ?? null,
        created_at: new Date().toISOString(),
        item_count: 0,
        completed_count: 0,
      };
      db.playlists.push(playlist);
      return playlist;
    }

    case "update_playlist": {
      const pl = db.playlists.find((o) => o.id === args?.id);
      if (pl) Object.assign(pl, (args?.playlist as Partial<Playlist>) ?? {});
      return pl ?? null;
    }

    case "delete_playlist": {
      db.playlists = db.playlists.filter((p) => p.id !== args?.id);
      db.items = db.items.filter((i) => i.playlist_id !== args?.id);
      db.tasks = db.tasks.filter((t) => t.playlist_id !== args?.id);
      return null;
    }

    case "list_items":
      return db.items
        .filter((i) => i.playlist_id === args?.playlistId)
        .sort((a, b) => a.position - b.position);

    case "import_playlist": {
      const input = args?.input as { title?: string; url: string; dailyTarget?: number };
      const playlist = (await mockInvoke("create_playlist", {
        playlist: {
          title: input.title ?? "Imported playlist",
          source_url: input.url,
          source_type: "youtube",
          daily_target: input.dailyTarget ?? 2,
          task_type: "video",
        },
      })) as Playlist;
      for (let i = 0; i < 18; i++) {
        await mockInvoke("add_item", {
          playlistId: playlist.id,
          item: { title: `Imported item ${i + 1}`, url: input.url, source_item_id: null },
        });
      }
      playlist.item_count = 18;
      return playlist;
    }

    case "add_item": {
      const pl = db.playlists.find((o) => o.id === args?.playlistId);
      const item = args?.item as { title: string; url?: string | null; source_item_id?: string | null };
      if (!pl) throw new Error("playlist not found");
      const position = db.items.filter((i) => i.playlist_id === pl.id).length;
      const created: PlaylistItem = {
        id: uid("it"),
        playlist_id: pl.id,
        source_item_id: item.source_item_id ?? null,
        title: item.title,
        url: item.url ?? null,
        position,
        topic: null,
        difficulty: null,
        duration_seconds: null,
        completed: false,
      };
      db.items.push(created);
      pl.item_count++;
      return created;
    }

    case "delete_item": {
      const it = db.items.find((i) => i.id === args?.itemId);
      db.items = db.items.filter((i) => i.id !== args?.itemId);
      if (it) {
        const pl = db.playlists.find((p) => p.id === it.playlist_id);
        if (pl) pl.item_count = Math.max(0, pl.item_count - 1);
      }
      return null;
    }

    case "reorder_item": {
      const it = db.items.find((i) => i.id === args?.itemId);
      if (it) it.position = Number(args?.newPosition ?? it.position);
      return null;
    }

    case "fetch_youtube_playlist":
      return { title: "Preview playlist", items: [] };

    case "rebuild_schedule": {
      // Mock: fill up tomorrow's quota per playlist from unconsumed items.
      let added = 0;
      const tomorrow = formatDateKey(addDays(new Date(), 1));
      for (const pl of db.playlists) {
        if (typeof args?.playlistId === "string" && args?.playlistId !== pl.id) continue;
        const consumed = db.tasks
          .filter((t) => t.playlist_id === pl.id && t.status !== "completed")
          .map((t) => t.item_id);
        const next = db.items
          .filter((i) => i.playlist_id === pl.id && !i.completed && !consumed.includes(i.id))
          .sort((a, b) => a.position - b.position)
          .slice(0, pl.daily_target);
        next.forEach((it, i) => {
          db.tasks.push({
            id: uid("t"),
            item_id: it.id,
            playlist_id: pl.id,
            playlist_title: pl.title,
            playlist_color: pl.color,
            item_title: it.title,
            item_url: it.url,
            planned_date: tomorrow,
            status: "pending",
            locked: false,
            office_position: i,
            item_difficulty: it.difficulty,
            item_topic: it.topic,
            playlist_policy: pl.ordering_policy,
          });
          added++;
        });
      }
      return { added, moved: 0, dropped: 0, playlist_id: null, version: 1 };
    }

    case "reschedule_task": {
      const t = db.tasks.find((x) => x.id === args?.taskId);
      if (t) t.planned_date = String(args?.newDate);
      return t ?? null;
    }

    case "complete_task": {
      const t = db.tasks.find((x) => x.id === args?.taskId);
      if (t && t.status !== "completed") {
        t.status = "completed";
        db.completions.push({ task_id: t.id, completed_at: new Date().toISOString() });
        const it = db.items.find((i) => i.id === t.item_id);
        const pl = db.playlists.find((p) => p.id === t.playlist_id);
        if (it && !it.completed) {
          it.completed = true;
          if (pl) pl.completed_count++;
        }
      }
      return null;
    }

    case "uncomplete_task": {
      const t = db.tasks.find((x) => x.id === args?.taskId);
      if (t) t.status = "pending";
      return null;
    }

    case "get_day_plan":
      return dayPlan(String(args?.date));

    case "get_range_plans": {
      const start = String(args?.start);
      const end = String(args?.end);
      const dates = new Set<string>();
      for (const t of db.tasks) {
        if (t.planned_date >= start && t.planned_date <= end) dates.add(t.planned_date);
      }
      return [...dates].sort().map(dayPlan);
    }

    case "get_dashboard": {
      const date = formatDateKey(today());
      const yesterday = formatDateKey(addDays(new Date(), -1));
      const t = db.tasks.filter((x) => x.planned_date === date);
      const completedToday = t.filter((x) => x.status === "completed").length;
      const week = db.completions.filter(
        (c) => new Date(c.completed_at).getTime() > Date.now() - 7 * 86400000,
      ).length;
      return {
        today: dayPlan(date),
        yesterday: dayPlan(yesterday),
        streak: streakStats(),
        weekly_completions: week,
        planned_today: t.length,
        completed_today: completedToday,
        all_done: t.length > 0 && completedToday === t.length,
      };
    }

    case "get_streaks":
      return streakStats();

    case "get_heatmap": {
      const count = Number(args?.days ?? 180);
      const map = new Map<string, number>();
      for (const c of db.completions) {
        const k = formatDateKey(new Date(c.completed_at));
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      const days = [];
      for (let i = count - 1; i >= 0; i--) {
        const key = formatDateKey(addDays(new Date(), -i));
        days.push({ date: key, completed: map.get(key) ?? 0, planned: 0 });
      }
      return { days };
    }

    case "get_playlist_progress": {
      const out = [];
      const todayKey = formatDateKey(today());
      for (const pl of db.playlists) {
        const plTasks = db.tasks.filter((t) => t.playlist_id === pl.id);
        out.push({
          playlist: pl,
          completion_rate: pl.item_count ? pl.completed_count / pl.item_count : 0,
          total_items: pl.item_count,
          completed_items: pl.completed_count,
          completed_last_7: plTasks.filter(
            (t) =>
              t.status === "completed" &&
              t.planned_date > formatDateKey(addDays(new Date(), -7)),
          ).length,
          completed_last_30: plTasks.filter(
            (t) =>
              t.status === "completed" &&
              t.planned_date > formatDateKey(addDays(new Date(), -30)),
          ).length,
          overdue: plTasks.filter(
            (t) => t.status != "completed" && t.planned_date < todayKey,
          ).length,
        });
      }
      return out;
    }

    case "get_completions_by_day": {
      const count = Number(args?.days ?? 60);
      const map = new Map<string, number>();
      for (const c of db.completions) {
        const k = formatDateKey(new Date(c.completed_at));
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      const out: { date: string; completed: number }[] = [];
      for (let i = count - 1; i >= 0; i--) {
        const key = formatDateKey(addDays(new Date(), -i));
        out.push({ date: key, completed: map.get(key) ?? 0 });
      }
      return out;
    }

    case "get_settings":
      return db.settings;

    case "set_settings":
      db.settings = { ...db.settings, ...(args?.settings as Partial<AppSettings>) };
      return db.settings;

    case "wipe_learning_data":
      // Mirror the real command: every piece of study data goes, preferences
      // and the provider stay.
      db.playlists = [];
      db.items = [];
      db.tasks = [];
      db.completions = [];
      db.notes = [];
      db.versions = [];
      db.quizzes = [];
      db.cards = [];
      db.reviews = [];
      db.jobs = [];
      db.chats = {};
      // Keep `seeded` true: the preview must not silently re-plant demo data
      // the moment the wipe finishes.
      return undefined;

    /* ------------------------------ notes ------------------------------ */

    case "list_notes":
      return [...db.notes]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((n) => ({ ...n }) as Note);

    case "get_note":
      return (db.notes.find((n) => n.item_id === args?.itemId) ?? null) as Note | null;

    case "save_note": {
      const itemId = String(args?.itemId);
      const body = String(args?.body ?? "");
      const source = String(args?.source ?? "user");
      const now = new Date().toISOString();
      const item = db.items.find((i) => i.id === itemId);
      let note = db.notes.find((n) => n.item_id === itemId);
      if (note) {
        note.version += 1;
        note.body = body;
        note.source = source;
        note.updated_at = now;
      } else {
        note = {
          id: uid("nt"),
          item_id: itemId,
          playlist_id: item?.playlist_id ?? null,
          item_title: item?.title ?? "Lesson",
          title: String(args?.itemTitle ?? item?.title ?? "Lesson notes"),
          body,
          source,
          version: 1,
          updated_at: now,
        };
        db.notes.push(note);
      }
      db.versions.push({
        id: uid("nv"),
        note_id: note.id,
        version: note.version,
        body,
        source,
        created_at: now,
      });
      return { ...note } as Note;
    }

    case "note_versions":
      return db.versions
        .filter((v) => v.note_id === args?.noteId)
        .sort((a, b) => b.version - a.version)
        .map((v) => ({ ...v }) as NoteVersion);

    case "restore_note_version": {
      const v = db.versions.find(
        (x) => x.note_id === args?.noteId && x.version === Number(args?.version),
      );
      const note = db.notes.find((n) => n.id === args?.noteId);
      if (!v || !note) throw new Error("That version no longer exists.");
      return mockInvoke("save_note", {
        itemId: note.item_id,
        itemTitle: note.title,
        body: v.body,
        source: "restore",
      });
    }

    /* -------------------------------- ai ------------------------------- */

    case "get_ai_config":
      return { ...db.ai };

    case "set_ai_config":
      db.ai = { ...(args?.config as AiConfig) };
      return {
        configured: db.ai.enabled && db.ai.api_key.trim().length > 0,
        model: db.ai.model,
        base_url: db.ai.base_url,
      };

    case "test_ai_connection": {
      const cfg = (args?.config ?? db.ai) as AiConfig;
      if (!cfg.api_key.trim()) throw new Error("No API key set.");
      await delay(500);
      return "ready";
    }

    case "ai_chat": {
      const messages = (args?.messages ?? []) as ChatMessage[];
      const thread = (args?.thread as string | null) ?? "companion";
      const question = messages[messages.length - 1]?.content ?? "";
      await delay(600);
      if (!db.ai.enabled || !db.ai.api_key.trim()) {
        return "I can't reach a provider yet. Add your gateway URL, model and key in Settings → AI, and I can answer questions about this lesson from its title, your notes and your progress.";
      }
      const answer = [
        `Here is how I'd approach **${truncateText(question, 80)}**:`,
        "",
        "1. Name the invariant first — what must stay true after each step?",
        "2. Walk one small example by hand, then generalise it.",
        "3. Only then write code, and test the empty and single-element cases.",
        "",
        "_Browser preview is using the offline mock. In the desktop app this answer comes from your configured gateway._",
      ].join("\n");
      db.chats[thread] = [
        ...(db.chats[thread] ?? []),
        ...messages.filter((m) => m.content.trim()),
        { role: "assistant" as const, content: answer },
      ];
      return answer;
    }

    case "list_chat":
      return [...(db.chats[String(args?.thread)] ?? [])];

    case "clear_chat":
      delete db.chats[String(args?.thread)];
      return undefined;

    case "enqueue_generation": {
      const kind = String(args?.kind);
      const itemId = (args?.itemId as string | null) ?? null;
      const job: Job = {
        id: uid("job"),
        kind,
        item_id: itemId,
        status: "queued",
        attempts: 0,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.jobs.unshift(job);
      void completeMockJob(job, itemId);
      return { ...job };
    }

    case "list_jobs":
      return db.jobs.slice(0, 40).map((j) => ({ ...j }));

    case "ai_optimize_plan": {
      if (!db.ai.enabled || !db.ai.api_key.trim()) {
        throw new Error(
          "No AI provider is configured. Add one in Settings → AI, or use Rebuild for the deterministic plan.",
        );
      }
      const flexible = db.playlists.filter((p) => p.ordering_policy === "flexible");
      if (flexible.length === 0) {
        return { moved: 0, playlists: 0, note: "No flexible playlists with unfinished items." };
      }
      await delay(900);
      let moved = 0;
      for (const pl of flexible) {
        const open = db.items
          .filter((i) => i.playlist_id === pl.id && !i.completed)
          .sort((a, b) => a.position - b.position);
        const slots = db.items
          .filter((i) => i.playlist_id === pl.id)
          .map((i) => i.position)
          .sort((a, b) => a - b);
        open.forEach((item, idx) => {
          const next = slots[idx] ?? idx;
          if (item.position !== next) moved++;
          item.position = next;
          item.difficulty = item.difficulty ?? 3;
        });
        pl.planning_mode = "ai";
      }
      return {
        moved,
        playlists: flexible.length,
        note: "Browser preview: the mock re-orders flexible lists only. The desktop app asks your gateway.",
      };
    }

    case "ai_reorder_playlist": {
      if (!db.ai.enabled || !db.ai.api_key.trim()) {
        throw new Error(
          "No AI provider is configured. Add one in Settings → AI, or keep the sequential plan.",
        );
      }
      const pl = db.playlists.find((p) => p.id === args?.playlistId);
      if (!pl) throw new Error("That playlist no longer exists.");
      if (pl.ordering_policy === "strict") {
        throw new Error(
          "This playlist is set to strict sequence, so its order is part of the course. Switch it to flexible first.",
        );
      }
      const open = db.items
        .filter((i) => i.playlist_id === pl.id && !i.completed)
        .sort((a, b) => a.position - b.position);
      if (open.length < 2) return { moved: 0, labelled: 0, clusters: 0, note: "Nothing to reorder." };
      await delay(700);
      // Browser stub: a deterministic "topic cluster" shuffle so the UI flow
      // can be exercised without a gateway.
      const topics = ["fundamentals", "patterns", "optimisation", "edge cases"];
      const slots = db.items
        .filter((i) => i.playlist_id === pl.id)
        .map((i) => i.position)
        .sort((a, b) => a - b);
      let moved = 0;
      open.forEach((item, idx) => {
        const original = slots[idx] ?? idx;
        item.position = original;
        item.topic = topics[Math.floor(idx / Math.max(1, Math.ceil(open.length / 4)))] ?? topics[0]!
        item.difficulty = 1 + Math.floor((idx / open.length) * 4);
        if (original !== idx) moved++;
      });
      pl.planning_mode = "ai";
      return {
        moved,
        labelled: open.length,
        clusters: topics.length,
        note: `Ordered ${moved} of ${open.length} items into ${topics.length} topic clusters.`,
      };
    }

    case "retry_job": {
      const j = db.jobs.find((x) => x.id === args?.id);
      if (j) {
        j.status = "queued";
        j.error = null;
        void completeMockJob(j, j.item_id);
      }
      return null;
    }

    /* ----------------------------- revision ---------------------------- */

    case "list_quizzes":
      return db.quizzes.map((q) => ({ ...q }));

    case "submit_quiz": {
      const quiz = db.quizzes.find((q) => q.id === args?.quizId);
      if (!quiz) throw new Error("Quiz not found.");
      const answers = (args?.answers ?? []) as number[];
      const score = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
      quiz.best_score = Math.max(quiz.best_score ?? 0, score);
      return score;
    }

    case "list_flashcards":
      return db.cards.map((c) => ({
        ...c,
        reviews: db.reviews.filter((r) => r.card_id === c.id).length,
        last_reviewed:
          db.reviews.filter((r) => r.card_id === c.id).sort((a, b) =>
            b.reviewed_at.localeCompare(a.reviewed_at),
          )[0]?.reviewed_at ?? null,
      }));

    case "review_flashcard":
      db.reviews.push({
        card_id: String(args?.cardId),
        rating: String(args?.rating ?? "good"),
        reviewed_at: new Date().toISOString(),
      });
      return null;

    case "get_artifacts": {
      const itemId = String(args?.itemId);
      return {
        has_note: db.notes.some((n) => n.item_id === itemId),
        quizzes: db.quizzes.filter((q) => q.item_id === itemId).length,
        cards: db.cards.filter((c) => c.item_id === itemId).length,
      };
    }

    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const truncateText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Simulates the Rust worker: a job lands in the queue, finishes shortly
 *  after and leaves its artifact behind. */
async function completeMockJob(job: Job, itemId: string | null) {
  await delay(900);
  job.status = "running";
  job.attempts += 1;
  job.updated_at = new Date().toISOString();
  await delay(1400);

  if (!db.ai.enabled || !db.ai.api_key.trim()) {
    job.status = "failed";
    job.error = "No AI provider configured. Add your gateway in Settings → AI.";
    job.updated_at = new Date().toISOString();
    return;
  }

  const item = db.items.find((i) => i.id === itemId);
  const title = item?.title ?? "Lesson";
  const playlist = db.playlists.find((p) => p.id === item?.playlist_id);

  if (job.kind === "generate_note") {
    await mockInvoke("save_note", {
      itemId,
      itemTitle: title,
      source: "ai",
      body: [
        `## ${title}`,
        "",
        "One-line summary of the lesson goes here, written by your gateway.",
        "",
        "## How it fits together",
        "",
        "```mermaid",
        "flowchart TD",
        "  A[Read the problem] --> B{Brute force?}",
        "  B -- too slow --> C[Find the invariant]",
        "  B -- fits --> D[Implement]",
        "  C --> E[Choose the data structure]",
        "  E --> D",
        "  D --> F[Test edges]",
        "```",
        "",
        "### Key ideas",
        "- The invariant that makes the approach correct.",
        "- Why the naive version is too slow.",
        "- The step that actually buys the speedup.",
        "",
        "```python",
        "def solve(xs):",
        "    # browser-preview stub; the desktop app writes real notes",
        "    return xs",
        "```",
        "",
        "### Pitfalls",
        "1. Off-by-one when the window slides.",
        "2. Forgetting to reset state between cases.",
      ].join("\n"),
    });
  } else if (job.kind === "generate_quiz") {
    db.quizzes.unshift({
      id: uid("qz"),
      item_id: itemId,
      playlist_id: playlist?.id ?? null,
      title: `${title} — quiz`,
      created_at: new Date().toISOString(),
      best_score: null,
      total: 3,
      questions: [
        {
          prompt: `What does "${truncateText(title, 40)}" mainly teach?`,
          choices: ["A data structure invariant", "A deployment tool", "A colour system", "A test runner"],
          answer: 0,
          why: "The lesson builds around one invariant you must preserve.",
        },
        {
          prompt: "Which case breaks the naive implementation?",
          choices: ["Empty input", "A single element", "All duplicates", "Already sorted input"],
          answer: 2,
          why: "Duplicates collapse the invariant unless you handle them explicitly.",
        },
        {
          prompt: "What is the first thing to prove about the algorithm?",
          choices: ["Runtime", "Termination", "Style", "Memory layout"],
          answer: 1,
          why: "A loop that does not terminate invalidates every other claim.",
        },
      ],
    });
  } else {
    const cards: [string, string][] = [
      ["What is the core invariant?", "The property that must hold before and after every step."],
      ["When does the naive approach fail?", "On duplicates and on empty input, which the invariant must cover."],
      ["What should you test first?", "Termination, then the smallest failing example, then the full case."],
    ];
    for (const [front, back] of cards) {
      db.cards.unshift({
        id: uid("fc"),
        item_id: itemId,
        deck: playlist?.title ?? "General",
        front,
        back,
        created_at: new Date().toISOString(),
        reviews: 0,
        last_reviewed: null,
      });
    }
  }

  job.status = "done";
  job.updated_at = new Date().toISOString();
}
