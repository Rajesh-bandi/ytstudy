use tauri::State;
use sqlx::Row;

use crate::models::{Flashcard, Quiz};
use crate::AppDb;



#[tauri::command]
pub async fn list_quizzes(db: State<'_, AppDb>) -> Result<Vec<Quiz>, String> {
    db.lock().await.list_quizzes().await
}

#[tauri::command]
pub async fn submit_quiz(db: State<'_, AppDb>, quizId: String, answers: Vec<i64>) -> Result<i64, String> {
    db.lock().await.submit_quiz(&quizId, answers).await
}

#[tauri::command]
pub async fn list_flashcards(db: State<'_, AppDb>) -> Result<Vec<Flashcard>, String> {
    db.lock().await.list_flashcards().await
}

#[tauri::command]
pub async fn review_flashcard(db: State<'_, AppDb>, cardId: String, rating: String) -> Result<(), String> {
    db.lock().await.review_flashcard(&cardId, &rating).await
}

/// Per-item artifact flags, used by the playlist rows to show which lessons
/// already have a note, a quiz or cards.
#[tauri::command]
pub async fn get_artifacts(
    db: State<'_, AppDb>,
    itemId: String,
) -> Result<crate::models::ArtifactSummary, String> {
    let guard = db.lock().await;
    let has_note: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM notes WHERE item_id = ? LIMIT 1")
            .bind(&itemId)
            .fetch_optional(&guard.pool)
            .await
            .map_err(|e| e.to_string())?;
    let quizzes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quizzes WHERE item_id = ?")
        .bind(&itemId)
        .fetch_one(&guard.pool)
        .await
        .unwrap_or(0);
    let cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards WHERE item_id = ?")
        .bind(&itemId)
        .fetch_one(&guard.pool)
        .await
        .unwrap_or(0);
    Ok(crate::models::ArtifactSummary {
        has_note: has_note.is_some(),
        quizzes,
        cards,
    })
}
