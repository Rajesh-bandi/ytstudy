use sqlx::Row;
use tauri::State;

use crate::ai;
use crate::jobs;
use crate::models::{now_iso, AiConfig, AiStatus, ChatMessage};
use crate::AppDb;

/// How much stored conversation is replayed to the model. Enough for
/// continuity, small enough that a long session never blows the budget.
const CHAT_MEMORY: usize = 16;

#[tauri::command]
pub async fn get_ai_config(db: State<'_, AppDb>) -> Result<AiConfig, String> {
    Ok(db.lock().await.ai_config().await)
}

#[tauri::command]
pub async fn set_ai_config(db: State<'_, AppDb>, config: AiConfig) -> Result<AiStatus, String> {
    let guard = db.lock().await;
    guard.save_ai_config(&config).await?;
    Ok(guard.ai_status().await)
}

#[tauri::command]
pub async fn test_ai_connection(config: AiConfig) -> Result<String, String> {
    ai::test_connection(&config).await
}

/// Companion chat / doubt solving. The caller may pass lesson context so
/// answers are grounded in what the learner is watching.
#[tauri::command]
pub async fn ai_chat(
    db: State<'_, AppDb>,
    messages: Vec<ChatMessage>,
    itemId: Option<String>,
    thread: Option<String>,
) -> Result<String, String> {
    let thread_key = thread
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "companion".into());

    let (cfg, context, progress, stored) = {
        let guard = db.lock().await;
        let cfg = guard.ai_config().await;
        let ctx = match itemId.as_deref() {
            Some(id) => ai::item_context(&guard, id).await.ok(),
            None => None,
        };
        let progress = ai::progress_context(&guard).await;
        let stored = load_thread(&guard.pool, &thread_key).await?;
        (cfg, ctx, progress, stored)
    };

    let mut thread = Vec::with_capacity(messages.len() + stored.len() + 2);
    thread.push(ChatMessage {
        role: "system".into(),
        content: format!(
            "You are the study companion living inside YTStudy, a desktop study planner. \
             You can see the learner's real progress, listed below. Be concise, concrete and \
             warm; use Markdown; prefer worked examples and one clear next action. \
             Never invent numbers — quote only what is in the progress block, and say so if \
             something is not there. If the learner is behind, do not shame them: offer the \
             smallest useful next step. If they are ahead, say so plainly.\n\n\
             Progress:\n{progress}\n\nCurrent lesson:\n{}",
            context.unwrap_or_else(|| "none".into())
        ),
    });
    thread.extend(stored);
    thread.extend(messages.iter().cloned());

    let answer = ai::chat(&cfg, &thread).await?;

    // Persist only after a successful answer, so a failed attempt does not
    // leave half a conversation behind.
    {
        let guard = db.lock().await;
        for m in &messages {
            if m.content.trim().is_empty() {
                continue;
            }
            let _ = sqlx::query(
                "INSERT INTO chat_messages (id, thread, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&thread_key)
            .bind(&m.role)
            .bind(&m.content)
            .bind(now_iso())
            .execute(&guard.pool)
            .await;
        }
        let _ = sqlx::query(
            "INSERT INTO chat_messages (id, thread, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&thread_key)
        .bind(&answer)
        .bind(now_iso())
        .execute(&guard.pool)
        .await;
    }

    Ok(answer)
}

async fn load_thread(pool: &sqlx::SqlitePool, thread: &str) -> Result<Vec<ChatMessage>, String> {
    let rows = sqlx::query(
        "SELECT role, content FROM (
           SELECT role, content, created_at FROM chat_messages
            WHERE thread = ? AND role IN ('user', 'assistant')
            ORDER BY created_at DESC LIMIT ?
         ) ORDER BY created_at ASC",
    )
    .bind(thread)
    .bind(CHAT_MEMORY as i64)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| ChatMessage {
            role: r.try_get("role").unwrap_or_default(),
            content: r.try_get("content").unwrap_or_default(),
        })
        .collect())
}

/// The UI restores a conversation on mount; `thread` is "companion" for the
/// global dock or an item id for a lesson's doubts.
#[tauri::command]
pub async fn list_chat(db: State<'_, AppDb>, thread: String) -> Result<Vec<ChatMessage>, String> {
    let guard = db.lock().await;
    load_thread(&guard.pool, &thread).await
}

#[tauri::command]
pub async fn clear_chat(db: State<'_, AppDb>, thread: String) -> Result<(), String> {
    let guard = db.lock().await;
    sqlx::query("DELETE FROM chat_messages WHERE thread = ?")
        .bind(thread)
        .execute(&guard.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn enqueue_generation(
    db: State<'_, AppDb>,
    kind: String,
    itemId: Option<String>,
    playlistId: Option<String>,
) -> Result<crate::models::Job, String> {
    let job = {
        let guard = db.lock().await;
        guard
            .enqueue(&kind, itemId.as_deref(), playlistId.as_deref())
            .await?
    };
    // Kick the worker immediately so the UI shows progress without waiting
    // for the next tick.
    let handle = db.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _ = jobs::worker_tick(&handle).await;
    });
    Ok(job)
}

#[tauri::command]
pub async fn list_jobs(db: State<'_, AppDb>) -> Result<Vec<crate::models::Job>, String> {
    db.lock().await.list_jobs(40).await
}

#[tauri::command]
pub async fn retry_job(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let handle = db.inner().clone();
    {
        let guard = db.lock().await;
        guard.retry_job(&id).await?;
    }
    tauri::async_runtime::spawn(async move {
        let _ = jobs::worker_tick(&handle).await;
    });
    Ok(())
}
