use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type Id = String;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaylistSource {
    Youtube,
    Manual,
    Url,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Video,
    Coding,
    Theory,
    Mixed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OrderingPolicy {
    Strict,
    Flexible,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanningMode {
    Sequential,
    Ai,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Completed,
    Skipped,
    Locked,
}

#[derive(Debug, Clone, Serialize)]
pub struct Playlist {
    pub id: Id,
    pub title: String,
    pub source_url: Option<String>,
    pub source_type: PlaylistSource,
    pub task_type: TaskType,
    pub daily_target: i64,
    pub max_daily_items: Option<i64>,
    pub ordering_policy: OrderingPolicy,
    pub planning_mode: PlanningMode,
    pub color: Option<String>,
    pub created_at: String,
    pub item_count: i64,
    pub completed_count: i64,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case", default)]
pub struct PlaylistPatch {
    pub title: Option<String>,
    pub source_url: Option<String>,
    pub source_type: Option<PlaylistSource>,
    pub task_type: Option<TaskType>,
    pub daily_target: Option<i64>,
    pub max_daily_items: Option<i64>,
    pub ordering_policy: Option<OrderingPolicy>,
    pub planning_mode: Option<PlanningMode>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistItem {
    pub id: Id,
    pub playlist_id: Id,
    pub source_item_id: Option<String>,
    pub title: String,
    pub url: Option<String>,
    pub position: i64,
    pub topic: Option<String>,
    pub difficulty: Option<i64>,
    pub duration_seconds: Option<i64>,
    pub completed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewItem {
    pub title: String,
    pub url: Option<String>,
    pub source_item_id: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScheduledTask {
    pub id: Id,
    pub item_id: Id,
    pub playlist_id: Id,
    pub playlist_title: String,
    pub playlist_color: Option<String>,
    pub item_title: String,
    pub item_url: Option<String>,
    /// Local-date key, e.g. 2026-10-22 (matches frontend format()).
    pub planned_date: String,
    pub status: TaskStatus,
    pub locked: bool,
    pub office_position: i64,
    /// Lesson metadata, so a plan row can show difficulty and topic without a
    /// second request per task.
    pub item_difficulty: Option<i64>,
    pub item_topic: Option<String>,
    pub playlist_policy: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DayPlan {
    pub date: String,
    pub tasks: Vec<ScheduledTask>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct PlanDiff {
    pub added: i64,
    pub moved: i64,
    pub dropped: i64,
    pub playlist_id: Option<Id>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreakStats {
    pub current_streak: i64,
    pub best_streak: i64,
    pub qualifying_days_total: i64,
    pub last_completed_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DayCompletion {
    pub date: String,
    pub completed: i64,
    pub planned: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeatmapData {
    pub days: Vec<DayCompletion>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistProgress {
    pub playlist: Playlist,
    pub completion_rate: f64,
    pub total_items: i64,
    pub completed_items: i64,
    pub completed_last_7: i64,
    pub completed_last_30: i64,
    pub overdue: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardData {
    pub today: DayPlan,
    pub yesterday: DayPlan,
    pub streak: StreakStats,
    pub weekly_completions: i64,
    pub planned_today: i64,
    pub completed_today: i64,
    pub all_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct AppSettings {
    pub daily_horizon_days: i64,
    pub work_dates: Vec<i64>,
    /// What the learner calls the companion, and which character it wears.
    pub companion_name: String,
    pub companion_skin: String,
    /// Editable instructions per generator. Empty means "use the built-in
    /// prompt", so older settings files keep working after an upgrade.
    pub note_prompt: String,
    pub quiz_prompt: String,
    pub flashcard_prompt: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            daily_horizon_days: 21,
            work_dates: (0..7).collect(),
            companion_name: "Meep".into(),
            companion_skin: "meep".into(),
            note_prompt: String::new(),
            quiz_prompt: String::new(),
            flashcard_prompt: String::new(),
        }
    }
}

impl AppSettings {
    pub fn effective_note_prompt(&self) -> &str {
        crate::prompts::or_default(&self.note_prompt, crate::prompts::NOTE_SYSTEM)
    }

    pub fn effective_quiz_prompt(&self) -> &str {
        crate::prompts::or_default(&self.quiz_prompt, crate::prompts::QUIZ_SYSTEM)
    }

    pub fn effective_flashcard_prompt(&self) -> &str {
        crate::prompts::or_default(&self.flashcard_prompt, crate::prompts::FLASHCARD_SYSTEM)
    }
}

/// Shipped prompts, so the UI can offer a real per-field reset instead of
/// trusting a copy of the text in the frontend bundle.
#[derive(Debug, Clone, Serialize)]
pub struct PromptDefaults {
    pub note: String,
    pub quiz: String,
    pub flashcard: String,
}

/// Matches the payload the UI sends (`taskType`, `dailyTarget`, `orderingPolicy`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInput {
    pub title: Option<String>,
    pub url: String,
    #[serde(default = "default_task_type")]
    pub task_type: TaskType,
    #[serde(default = "default_target")]
    pub daily_target: i64,
    #[serde(default = "default_order")]
    pub ordering_policy: OrderingPolicy,
}

fn default_task_type() -> TaskType {
    TaskType::Video
}
fn default_target() -> i64 {
    2
}
fn default_order() -> OrderingPolicy {
    OrderingPolicy::Strict
}

/* ---------------------------- AI ---------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct AiConfig {
    /// OpenAI-compatible gateway root, e.g. https://gateway.example/v1
    pub base_url: String,
    pub model: String,
    /// Stored in the local SQLite file only; never leaves the machine except
    /// as a bearer token to the configured gateway.
    pub api_key: String,
    pub enabled: bool,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.omniroute.ai/v1".into(),
            model: "gpt-4o-mini".into(),
            api_key: String::new(),
            enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiStatus {
    pub configured: bool,
    pub model: String,
    pub base_url: String,
}

/* --------------------------- notes --------------------------- */

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: Id,
    pub item_id: String,
    pub playlist_id: Option<String>,
    pub item_title: String,
    pub title: String,
    pub body: String,
    pub source: String,
    pub version: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteVersion {
    pub id: Id,
    pub note_id: Id,
    pub version: i64,
    pub body: String,
    pub source: String,
    pub created_at: String,
}

/* --------------------------- jobs --------------------------- */

#[derive(Debug, Clone, Serialize)]
pub struct Job {
    pub id: Id,
    pub kind: String,
    pub item_id: Option<String>,
    pub status: String,
    pub attempts: i64,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/* ------------------------- revision ------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizQuestion {
    pub prompt: String,
    pub choices: Vec<String>,
    pub answer: i64,
    pub why: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Quiz {
    pub id: Id,
    pub item_id: Option<String>,
    pub playlist_id: Option<String>,
    pub title: String,
    pub questions: Vec<QuizQuestion>,
    pub created_at: String,
    pub best_score: Option<i64>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct QuizAttempt {
    pub id: Id,
    pub quiz_id: Id,
    pub score: i64,
    pub total: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ArtifactSummary {
    pub has_note: bool,
    pub quizzes: i64,
    pub cards: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Flashcard {
    pub id: Id,
    pub item_id: Option<String>,
    pub deck: String,
    pub front: String,
    pub back: String,
    pub created_at: String,
    pub reviews: i64,
    pub last_reviewed: Option<String>,
}

pub fn now_iso() -> String {
    DateTime::<Utc>::from_timestamp(chrono::Utc::now().timestamp(), 0)
        .map(|d| d.to_rfc3339())
        .unwrap_or_default()
}
