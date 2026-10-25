use tauri::State;

use crate::db::Db;
use crate::models::{Note, NoteVersion};
use crate::AppDb;



#[tauri::command]
pub async fn list_notes(db: State<'_, AppDb>) -> Result<Vec<Note>, String> {
    db.lock().await.list_notes().await
}

#[tauri::command]
pub async fn get_note(db: State<'_, AppDb>, itemId: String) -> Result<Option<Note>, String> {
    db.lock().await.note_for_item(&itemId).await
}

#[tauri::command]
pub async fn save_note(
    db: State<'_, AppDb>,
    itemId: String,
    itemTitle: String,
    body: String,
    source: Option<String>,
) -> Result<Note, String> {
    let title = if itemTitle.trim().is_empty() {
        "Lesson notes".to_string()
    } else {
        itemTitle
    };
    db.lock()
        .await
        .save_note(&itemId, None, &title, &body, source.as_deref().unwrap_or("user"))
        .await
}

#[tauri::command]
pub async fn note_versions(db: State<'_, AppDb>, noteId: String) -> Result<Vec<NoteVersion>, String> {
    db.lock().await.note_versions(&noteId).await
}

#[tauri::command]
pub async fn restore_note_version(db: State<'_, AppDb>, noteId: String, version: i64) -> Result<Note, String> {
    db.lock().await.restore_note_version(&noteId, version).await
}

/* Placeholder to keep the shared Db import meaningful if commands are trimmed. */
#[allow(dead_code)]
fn _db_marker(_d: &Db) {}
