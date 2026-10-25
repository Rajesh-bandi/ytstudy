use super::playlists::SharedDb;
use crate::models::{AppSettings, PromptDefaults};

#[tauri::command]
pub async fn get_settings(state: SharedDb<'_>) -> Result<AppSettings, String> {
    let db = state.lock().await;
    db.settings().await.map_err(|e| e.to_string())
}

/// The shipped prompts. Resetting a field in the UI restores the text the
/// backend would actually fall back to, rather than a stale frontend copy.
#[tauri::command]
pub fn get_prompt_defaults() -> PromptDefaults {
    crate::prompts::defaults()
}

/// Accepts a partial patch and merges it over what is stored, so changing one
/// preference (a companion name, say) never resets the others to defaults.
#[tauri::command]
pub async fn set_settings(
    state: SharedDb<'_>,
    settings: serde_json::Value,
) -> Result<AppSettings, String> {
    let db = state.lock().await;
    let current = db.settings().await.map_err(|e| e.to_string())?;
    let previous_horizon = current.daily_horizon_days;
    let mut base = serde_json::to_value(current).map_err(|e| e.to_string())?;

    if let (Some(target), Some(patch)) = (base.as_object_mut(), settings.as_object()) {
        for (key, value) in patch {
            target.insert(key.clone(), value.clone());
        }
    }

    let merged: AppSettings =
        serde_json::from_value(base).map_err(|e| format!("bad settings: {e}"))?;
    db.save_settings(&merged).await.map_err(|e| e.to_string())?;

    // A longer/shorter horizon only matters once the plan is rebuilt.
    if merged.daily_horizon_days != previous_horizon {
        let _ = crate::scheduler::rebuild(&db, None).await;
    }

    Ok(merged)
}

/// Erase every piece of learning data: playlists, lessons, the plan, its
/// completion history (so streaks reset with it), notes, quizzes, flashcards,
/// generated jobs and the companion's chat threads. Preferences and the AI
/// provider stay — those are how you work, not what you worked on.
#[tauri::command]
pub async fn wipe_learning_data(state: SharedDb<'_>) -> Result<(), String> {
    let db = state.lock().await;
    let mut tx = db.pool.begin().await.map_err(|e| e.to_string())?;

    // Children first, then parents; playlists cascade items and tasks anyway,
    // but explicit deletes keep the order obvious and FK-safe.
    let tables = [
        "completion_events",
        "scheduled_tasks",
        "plans",
        "flashcard_reviews",
        "flashcards",
        "quiz_attempts",
        "quizzes",
        "note_versions",
        "notes",
        "jobs",
        "chat_messages",
        "item_context_cache",
        "item_context_cache_v2",
        "items",
        "playlists",
    ];
    for table in tables {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("{table}: {e}"))?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
