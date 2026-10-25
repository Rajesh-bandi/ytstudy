import {
  DashboardData,
  AiConfig,
  AiPlanOptimize,
  AiStatus,
  ArtifactSummary,
  ChatMessage,
  AppSettings,
  DayPlan,
  Flashcard,
  HeatmapData,
  Job,
  JobKind,
  NewItemInput,
  Note,
  NoteVersion,
  PlanDiff,
  PlanOrderResult,
  Playlist,
  PlaylistItem,
  PlaylistProgress,
  PromptDefaults,
  Quiz,
  ScheduledTask,
  StreakStats,
} from "@/types";

/* Tauri detection -------------------------------------------------------

   The UI must remain previewable in a plain browser (`pnpm dev`).
   When the Tauri runtime is absent we swap in a deterministic mock
   backend with seed data. Production behavior is identical because
   Rust command shapes are mirrored 1:1.
*/

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** True inside the Tauri shell. The browser tab is always the mock, so
 *  screens can say so out loud instead of looking broken. */
export const isDesktop = "__TAURI_INTERNALS__" in window;

let invokeFn: InvokeFn;
if (isDesktop) {
  const { invoke } = await import("@tauri-apps/api/core");
  invokeFn = (cmd, args) => invoke(cmd, args) as Promise<unknown>;
} else {
  const { mockInvoke } = await import("./mock");
  invokeFn = mockInvoke;
}

import { formatDateKey } from "@/lib/date";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (await invokeFn(cmd, args)) as T;
}

/* ------------------------------ commands ------------------------------ */

export const api = {
  /* playlists */
  listPlaylists: () => call<Playlist[]>("list_playlists"),
  createPlaylist: (p: Partial<Playlist> & { title: string }) =>
    call<Playlist>("create_playlist", { playlist: p }),
  updatePlaylist: (id: string, p: Partial<Playlist>) =>
    call<Playlist>("update_playlist", { id, playlist: p }),
  deletePlaylist: (id: string) => call<void>("delete_playlist", { id }),
  listItems: (playlistId: string) => call<PlaylistItem[]>("list_items", { playlistId }),
  importPlaylist: (input: {
    title?: string;
    url: string;
    taskType?: string;
    dailyTarget?: number;
    orderingPolicy?: string;
  }) => call<Playlist>("import_playlist", { input }),
  addItem: (playlistId: string, item: Omit<NewItemInput, "position">) =>
    call<PlaylistItem>("add_item", { playlistId, item }),
  deleteItem: (itemId: string) => call<void>("delete_item", { itemId }),
  reorderItem: (itemId: string, newPosition: number) =>
    call<void>("reorder_item", { itemId, newPosition }),
  fetchYouTubePreview: (url: string) =>
    call<{ title: string; items: NewItemInput[] }>("fetch_youtube_playlist", { url }),

  /* scheduling */
  rebuildSchedule: (playlistId?: string) =>
    call<PlanDiff>("rebuild_schedule", { playlistId: playlistId ?? null }),
  rescheduleTask: (taskId: string, newDate: string) =>
    call<ScheduledTask>("reschedule_task", { taskId, newDate }),
  completeTask: (taskId: string) => call<void>("complete_task", { taskId }),
  uncompleteTask: (taskId: string) => call<void>("uncomplete_task", { taskId }),
  getDayPlan: (date: string) => call<DayPlan>("get_day_plan", { date }),
  getRangePlans: (start: string, end: string) => call<DayPlan[]>("get_range_plans", { start, end }),

  /* stats */
  getDashboard: () => call<DashboardData>("get_dashboard"),
  getStreaks: () => call<StreakStats>("get_streaks"),
  getHeatmap: (days: number) => call<HeatmapData>("get_heatmap", { days }),
  getPlaylistProgress: () => call<PlaylistProgress[]>("get_playlist_progress"),
  getCompletionsByDay: (days: number) =>
    call<{ date: string; completed: number }[]>("get_completions_by_day", { days }),

  /* settings */
  getSettings: () => call<AppSettings>("get_settings"),
  setSettings: (s: Partial<AppSettings>) => call<AppSettings>("set_settings", { settings: s }),
  /** Shipped instructions for notes, quizzes and cards; Reset restores one. */
  getPromptDefaults: () => call<PromptDefaults>("get_prompt_defaults"),
  /** Erases playlists, plan, completions/streaks, notes, quizzes, cards and
   *  chat threads. Preferences and the AI provider are kept. */
  wipeLearningData: () => call<void>("wipe_learning_data"),

  /* notes */
  listNotes: () => call<Note[]>("list_notes"),
  getNote: (itemId: string) => call<Note | null>("get_note", { itemId }),
  saveNote: (itemId: string, itemTitle: string, body: string, source?: string) =>
    call<Note>("save_note", { itemId, itemTitle, body, source }),
  noteVersions: (noteId: string) => call<NoteVersion[]>("note_versions", { noteId }),
  restoreNoteVersion: (noteId: string, version: number) =>
    call<Note>("restore_note_version", { noteId, version }),

  /* ai */
  getAiConfig: () => call<AiConfig>("get_ai_config"),
  setAiConfig: (config: AiConfig) => call<AiStatus>("set_ai_config", { config }),
  testAiConnection: (config: AiConfig) => call<string>("test_ai_connection", { config }),
  /** `thread` is the persisted conversation key: "companion" for the dock,
   *  the item id for a lesson's doubts. Send only the new turn; the backend
   *  replays stored history so a restart resumes the conversation. */
  aiChat: (messages: ChatMessage[], itemId?: string | null, thread?: string | null) =>
    call<string>("ai_chat", { messages, itemId: itemId ?? null, thread: thread ?? null }),
  listChat: (thread: string) => call<ChatMessage[]>("list_chat", { thread }),
  clearChat: (thread: string) => call<void>("clear_chat", { thread }),
  enqueueGeneration: (kind: JobKind, itemId?: string | null, playlistId?: string | null) =>
    call<Job>("enqueue_generation", {
      kind,
      itemId: itemId ?? null,
      playlistId: playlistId ?? null,
    }),
  listJobs: () => call<Job[]>("list_jobs"),
  retryJob: (id: string) => call<void>("retry_job", { id }),
  /** Companion-ordered plan for a flexible playlist (topic clusters,
   *  difficulty ramp). Fails with a readable message when AI is off. */
  aiReorderPlaylist: (playlistId: string) =>
    call<PlanOrderResult>("ai_reorder_playlist", { playlistId }),
  /** Whole-plan review: the companion sees every playlist's daily load and
   *  re-orders flexible work so each day stays balanced. */
  aiOptimizePlan: () => call<AiPlanOptimize>("ai_optimize_plan"),

  /* revision */
  listQuizzes: () => call<Quiz[]>("list_quizzes"),
  submitQuiz: (quizId: string, answers: number[]) =>
    call<number>("submit_quiz", { quizId, answers }),
  listFlashcards: () => call<Flashcard[]>("list_flashcards"),
  reviewFlashcard: (cardId: string, rating: string) =>
    call<void>("review_flashcard", { cardId, rating }),

  /* artifact lookup used by playlist rows */
  getArtifacts: (itemId: string) => call<ArtifactSummary>("get_artifacts", { itemId }),

  /* date helpers used by backend (kept as a tiny command for clock*/
  today: (): string => formatDateKey(new Date()),
};
