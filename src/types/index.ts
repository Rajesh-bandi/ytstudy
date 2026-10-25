export type TaskType = "video" | "coding" | "theory" | "mixed";
export type OrderingPolicy = "strict" | "flexible";
export type PlanningMode = "sequential" | "ai";
export type TaskStatus = "pending" | "completed" | "skipped" | "locked";
export type PlaylistSource = "youtube" | "manual" | "url";

export interface Playlist {
  id: string;
  title: string;
  source_url: string | null;
  source_type: PlaylistSource;
  task_type: TaskType;
  daily_target: number;
  max_daily_items: number | null;
  ordering_policy: OrderingPolicy;
  planning_mode: PlanningMode;
  color: string | null;
  created_at: string;
  item_count: number;
  completed_count: number;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  source_item_id: string | null;
  title: string;
  url: string | null;
  position: number;
  topic: string | null;
  difficulty: number | null;
  duration_seconds: number | null;
  completed: boolean;
}

export interface ScheduledTask {
  id: string;
  item_id: string;
  playlist_id: string;
  playlist_title: string;
  playlist_color: string | null;
  item_title: string;
  item_url: string | null;
  planned_date: string; // YYYY-MM-DD
  status: TaskStatus;
  locked: boolean;
  office_position: number;
  /** Lesson metadata for plan rows; null until the companion labels it. */
  item_difficulty: number | null;
  item_topic: string | null;
  playlist_policy: "strict" | "flexible" | string;
}

export interface AiPlanOptimize {
  moved: number;
  playlists: number;
  note: string;
}

export interface DayPlan {
  date: string;
  tasks: ScheduledTask[];
}

export interface StreakStats {
  current_streak: number;
  best_streak: number;
  qualifying_days_total: number;
  last_completed_date: string | null;
}

export interface DayCompletion {
  date: string;
  completed: number;
  planned: number;
}

export interface PlaylistProgress {
  playlist: Playlist;
  completion_rate: number;
  total_items: number;
  completed_items: number;
  completed_last_7: number;
  completed_last_30: number;
  overdue: number;
}

export interface DashboardData {
  today: DayPlan;
  yesterday: DayPlan;
  streak: StreakStats;
  weekly_completions: number;
  planned_today: number;
  completed_today: number;
  all_done: boolean;
}

export interface HeatmapData {
  days: DayCompletion[];
}

export interface PlanDiff {
  added: number;
  moved: number;
  dropped: number;
  playlist_id: string | null;
  version: number;
}

export type CompanionSkin = "meep" | "fox" | "cat" | "orb";

export interface AppSettings {
  daily_horizon_days: number;
  work_dates: number[]; // 0=Sunday..6=Saturday; -1 = every day
  companion_name: string;
  companion_skin: CompanionSkin;
  /** Empty means "use the shipped prompt" for that generator. */
  note_prompt: string;
  quiz_prompt: string;
  flashcard_prompt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  daily_horizon_days: 21,
  work_dates: [0, 1, 2, 3, 4, 5, 6],
  companion_name: "Meep",
  companion_skin: "meep",
  note_prompt: "",
  quiz_prompt: "",
  flashcard_prompt: "",
};

/** Text of the prompts shipped with the app, used by Reset and by the
 *  browser preview (the desktop build reads the same text from Rust). */
export interface PromptDefaults {
  note: string;
  quiz: string;
  flashcard: string;
}

export interface PlanOrderResult {
  moved: number;
  labelled: number;
  clusters: number;
  note: string;
}

/* ------------------------------- AI ------------------------------- */

export interface AiConfig {
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
}

export interface AiStatus {
  configured: boolean;
  model: string;
  base_url: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  base_url: "https://api.omniroute.ai/v1",
  model: "gpt-4o-mini",
  api_key: "",
  enabled: false,
};

/* ------------------------------ notes ------------------------------ */

export interface Note {
  id: string;
  item_id: string;
  playlist_id: string | null;
  item_title: string;
  title: string;
  body: string;
  source: "user" | "ai" | "restore" | string;
  version: number;
  updated_at: string;
}

export interface NoteVersion {
  id: string;
  note_id: string;
  version: number;
  body: string;
  source: string;
  created_at: string;
}

/* ------------------------------- jobs ------------------------------ */

export type JobKind = "generate_note" | "generate_quiz" | "generate_flashcards";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  kind: JobKind | string;
  item_id: string | null;
  status: JobStatus | string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- revision ---------------------------- */

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  answer: number;
  why: string;
}

export interface Quiz {
  id: string;
  item_id: string | null;
  playlist_id: string | null;
  title: string;
  questions: QuizQuestion[];
  created_at: string;
  best_score: number | null;
  total: number;
}

export interface Flashcard {
  id: string;
  item_id: string | null;
  deck: string;
  front: string;
  back: string;
  created_at: string;
  reviews: number;
  last_reviewed: string | null;
}

export interface ArtifactSummary {
  has_note: boolean;
  quizzes: number;
  cards: number;
}

export interface NewItemInput {
  title: string;
  url: string | null;
  source_item_id: string | null;
  position: number;
}
