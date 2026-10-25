use sqlx::Row;

use super::playlists::SharedDb;
use crate::db::today_key;
use crate::models::*;

pub(crate) async fn load_plan(
    db: &crate::db::Db,
    date: &str,
) -> Result<DayPlan, Box<dyn std::error::Error>> {
    let rows = sqlx::query(
        "SELECT t.id, t.item_id, t.playlist_id, t.status, t.locked, t.office_position,
                p.title, p.color, i.title, i.url, i.difficulty, i.topic, p.ordering_policy
           FROM scheduled_tasks t
           JOIN items i ON i.id = t.item_id
           JOIN playlists p ON p.id = t.playlist_id
          WHERE t.planned_date = ?
          ORDER BY t.office_position ASC",
    )
    .bind(date)
    .fetch_all(&db.pool)
    .await?;

    Ok(DayPlan {
        date: date.to_string(),
        tasks: rows
            .into_iter()
            .map(|r| {
                let status_raw: String = r.get(3);
                ScheduledTask {
                    id: r.get(0),
                    item_id: r.get(1),
                    playlist_id: r.get(2),
                    planned_date: date.to_string(),
                    status: match status_raw.as_str() {
                        "completed" => TaskStatus::Completed,
                        "skipped" => TaskStatus::Skipped,
                        _ => TaskStatus::Pending,
                    },
                    locked: r.get::<i64, _>(4) > 0,
                    office_position: r.get(5),
                    playlist_title: r.get(6),
                    playlist_color: r.get(7),
                    item_title: r.get(8),
                    item_url: r.get(9),
                    item_difficulty: r.get(10),
                    item_topic: r.get(11),
                    playlist_policy: r
                        .get::<String, _>(12)
                        .trim_matches('"')
                        .to_string(),
                }
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn get_day_plan(state: SharedDb<'_>, date: String) -> Result<DayPlan, String> {
    let db = state.lock().await;
    load_plan(&db, &date).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_range_plans(
    state: SharedDb<'_>,
    start: String,
    end: String,
) -> Result<Vec<DayPlan>, String> {
    let db = state.lock().await;
    // Collect distinct dates in range that have tasks (empty days are filled
    // client-side for contiguous grids).
    let dates: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT planned_date FROM scheduled_tasks
          WHERE planned_date >= ? AND planned_date <= ?
          ORDER BY planned_date",
    )
    .bind(&start)
    .bind(&end)
    .fetch_all(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(dates.len());
    for d in dates {
        out.push(load_plan(&db, &d).await.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub async fn complete_task(state: SharedDb<'_>, taskId: String) -> Result<(), String> {
    let db = state.lock().await;
    complete(&db, &taskId).await.map_err(|e| e.to_string())
}

pub(crate) async fn complete(
    db: &crate::db::Db,
    task_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Idempotent by design: a task marked completed stays completed.
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM completion_events WHERE task_id = ? LIMIT 1")
            .bind(task_id)
            .fetch_optional(&db.pool)
            .await?;
    if existing.is_some() {
        return Ok(());
    }
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT t.item_id, t.playlist_id, t.status FROM scheduled_tasks t WHERE t.id = ?",
    )
    .bind(task_id)
    .fetch_optional(&db.pool)
    .await?;
    let (item_id, playlist_id, _status) = row.ok_or("task not found")?;

    let mut tx = db.pool.begin().await?;
    sqlx::query("UPDATE scheduled_tasks SET status = 'completed' WHERE id = ?")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO completion_events (id, task_id, item_id, playlist_id, completed_at, event_type)
         VALUES (?, ?, ?, ?, ?, 'complete')",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(task_id)
    .bind(&item_id)
    .bind(&playlist_id)
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn uncomplete_task(state: SharedDb<'_>, taskId: String) -> Result<(), String> {
    let db = state.lock().await;
    uncomplete(&db, &taskId).await.map_err(|e| e.to_string())
}

pub(crate) async fn uncomplete(
    db: &crate::db::Db,
    task_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Manual correction only — an explicit user action on the exact task.
    // Needed for misclicks; never triggered by scheduling logic.
    sqlx::query(
        "UPDATE scheduled_tasks SET status = 'pending'
          WHERE id = ?
            AND id IN (SELECT task_id FROM completion_events WHERE task_id = ?)",
    )
    .bind(task_id)
    .bind(task_id)
    .execute(&db.pool)
    .await?;
    sqlx::query("DELETE FROM completion_events WHERE task_id = ?")
        .bind(task_id)
        .execute(&db.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn reschedule_task(
    state: SharedDb<'_>,
    taskId: String,
    newDate: String,
) -> Result<ScheduledTask, String> {
    let db = state.lock().await;
    // Validate the destination day exists as a sane date string.
    if chrono::NaiveDate::parse_from_str(&newDate, "%Y-%m-%d").is_err() {
        return Err("invalid date".into());
    }
    // Moving a COMPLETED task is forbidden in all cases — history stays put.
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM scheduled_tasks WHERE id = ?")
            .bind(&taskId)
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| e.to_string())?;
    if matches!(status.as_deref(), None) {
        return Err("task not found".into());
    }
    if status.as_deref() == Some("completed") {
        return Err("completed tasks cannot be rescheduled".into());
    }
    sqlx::query(
        "UPDATE scheduled_tasks SET planned_date = ?, locked = (planned_date != ?) WHERE id = ?",
    )
    .bind(&newDate)
    .bind(&newDate)
    .bind(&taskId)
    .execute(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    // recalc per-day ordering
    let all = load_plan(&db, &newDate).await.map_err(|e| e.to_string())?;
    for (i, t) in all.tasks.iter().enumerate() {
        sqlx::query("UPDATE scheduled_tasks SET office_position = ? WHERE id = ?")
            .bind(i as i64)
            .bind(&t.id)
            .execute(&db.pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    let plan = if newDate == today_key() || newDate.as_str() > today_key().as_str() {
        load_plan(&db, &newDate).await
    } else {
        load_plan(&db, &newDate).await
    };
    let updated = plan
        .map_err(|e| e.to_string())?
        .tasks
        .into_iter()
        .find(|t| t.id == taskId)
        .ok_or("task vanished")?;
    Ok(updated)
}

#[tauri::command]
pub async fn rebuild_schedule(
    state: SharedDb<'_>,
    playlistId: Option<String>,
) -> Result<PlanDiff, String> {
    let db = state.lock().await;
    crate::scheduler::rebuild(&db, playlistId.as_deref())
        .await
        .map_err(|e| e.to_string())
}
