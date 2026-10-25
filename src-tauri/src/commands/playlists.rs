use std::sync::Arc;
use sqlx::Row;
use tauri::State;
use tokio::sync::Mutex;

use crate::db::Db;
use crate::models::*;

pub type SharedDb<'r> = State<'r, Arc<Mutex<Db>>>;

const PALETTE: [&str; 6] = [
    "#d65d0e", "#b16286", "#458588", "#98971a", "#d79921", "#689d6a",
];

fn color_for(n: usize) -> String {
    PALETTE[n % PALETTE.len()].to_string()
}

/* ------------------------------- commands ------------------------------ */

#[tauri::command]
pub async fn list_playlists(state: SharedDb<'_>) -> Result<Vec<Playlist>, String> {
    let db = state.lock().await;
    db.load_playlists().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_playlist(
    state: SharedDb<'_>,
    playlist: PlaylistPatch,
) -> Result<Playlist, String> {
    let mut db = state.lock().await;
    db_create_playlist(&mut db, playlist).await.map_err(|e| e.to_string())
}

pub(crate) async fn db_create_playlist(
    db: &mut Db,
    patch: PlaylistPatch,
) -> Result<Playlist, Box<dyn std::error::Error>> {
    let title = patch.title.clone().unwrap_or_else(|| "Untitled".into());
    let n = db.load_playlists().await?.len();
    let id = uuid::Uuid::new_v4().to_string();
    let created = now_iso();
    sqlx::query(
        "INSERT INTO playlists (id, title, source_url, source_type, task_type, daily_target,
                                max_daily_items, ordering_policy, planning_mode, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(patch.source_url.clone())
    .bind(serde_json::to_string(&patch.source_type.unwrap_or(PlaylistSource::Manual))?)
    .bind(serde_json::to_string(&patch.task_type.unwrap_or(TaskType::Mixed))?)
    .bind(patch.daily_target.unwrap_or(1).max(1))
    .bind(serde_json::to_string(&patch.ordering_policy.unwrap_or(OrderingPolicy::Strict))?)
    .bind(serde_json::to_string(&patch.planning_mode.unwrap_or(PlanningMode::Sequential))?)
    .bind(color_for(n))
    .bind(&created)
    .execute(&db.pool)
    .await?;

    Ok(Playlist {
        id,
        title,
        source_url: patch.source_url.clone(),
        source_type: patch.source_type.clone().unwrap_or(PlaylistSource::Manual),
        task_type: patch.task_type.unwrap_or(TaskType::Mixed),
        daily_target: patch.daily_target.unwrap_or(1).max(1),
        max_daily_items: None,
        ordering_policy: patch.ordering_policy.unwrap_or(OrderingPolicy::Strict),
        planning_mode: patch.planning_mode.unwrap_or(PlanningMode::Sequential),
        color: Some(color_for(n)),
        created_at: created,
        item_count: 0,
        completed_count: 0,
    })
}

#[tauri::command]
pub async fn update_playlist(
    state: SharedDb<'_>,
    id: String,
    playlist: PlaylistPatch,
) -> Result<Playlist, String> {
    let mut db = state.lock().await;
    db_update_playlist(&mut db, id, playlist).await.map_err(|e| e.to_string())
}

pub(crate) async fn db_update_playlist(
    db: &mut Db,
    id: String,
    patch: PlaylistPatch,
) -> Result<Playlist, Box<dyn std::error::Error>> {
    let mut dirty = false;

    if let Some(t) = &patch.title {
        if !t.trim().is_empty() {
            sqlx::query("UPDATE playlists SET title = ? WHERE id = ?")
                .bind(t.trim())
                .bind(&id)
                .execute(&db.pool)
                .await?;
            dirty = true;
        }
    }
    if let Some(v) = &patch.task_type {
        sqlx::query("UPDATE playlists SET task_type = ? WHERE id = ?")
            .bind(serde_json::to_string(v)?)
            .bind(&id)
            .execute(&db.pool)
            .await?;
        dirty = true;
    }
    if let Some(v) = patch.daily_target {
        sqlx::query("UPDATE playlists SET daily_target = ? WHERE id = ?")
            .bind(v.max(1))
            .bind(&id)
            .execute(&db.pool)
            .await?;
        dirty = true;
    }
    if let Some(v) = &patch.ordering_policy {
        sqlx::query("UPDATE playlists SET ordering_policy = ? WHERE id = ?")
            .bind(serde_json::to_string(v)?)
            .bind(&id)
            .execute(&db.pool)
            .await?;
        dirty = true;
    }
    if let Some(v) = &patch.planning_mode {
        sqlx::query("UPDATE playlists SET planning_mode = ? WHERE id = ?")
            .bind(serde_json::to_string(v)?)
            .bind(&id)
            .execute(&db.pool)
            .await?;
        dirty = true;
    }

    if dirty {
        // Targets changed? Fill in any missed capacity ahead of time.
        let _ = crate::scheduler::rebuild(db, Some(&id)).await;
    }

    db.load_playlists()
        .await?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "playlist not found".to_string().into())
}

#[tauri::command]
pub async fn delete_playlist(state: SharedDb<'_>, id: String) -> Result<(), String> {
    let db = state.lock().await;
    sqlx::query("DELETE FROM playlists WHERE id = ?")
        .bind(&id)
        .execute(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_items(state: SharedDb<'_>, playlistId: String) -> Result<Vec<PlaylistItem>, String> {
    let db = state.lock().await;
    load_items(&db, &playlistId).await.map_err(|e| e.to_string())
}

pub(crate) async fn load_items(
    db: &Db,
    pid: &str,
) -> Result<Vec<PlaylistItem>, Box<dyn std::error::Error>> {
    let rows = sqlx::query(
        "SELECT i.id, i.source_item_id, i.title, i.url, i.position, i.topic, i.difficulty,
                i.duration_seconds,
                (SELECT COUNT(*) FROM completion_events c WHERE c.item_id = i.id) AS done
           FROM items i WHERE i.playlist_id = ? ORDER BY i.position",
    )
    .bind(pid)
    .fetch_all(&db.pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| PlaylistItem {
            id: r.get(0),
            playlist_id: pid.to_string(),
            source_item_id: r.get(1),
            title: r.get(2),
            url: r.get(3),
            position: r.get(4),
            topic: r.get(5),
            difficulty: r.get(6),
            duration_seconds: r.get(7),
            completed: r.get::<i64, _>(8) > 0,
        })
        .collect())
}

pub(crate) struct NewImportedItem {
    pub title: String,
    pub url: Option<String>,
    pub source_item_id: Option<String>,
}

pub(crate) async fn insert_item(
    db: &Db,
    pid: &str,
    item: &NewImportedItem,
) -> Result<PlaylistItem, Box<dyn std::error::Error>> {
    let position: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position), -1) + 1 FROM items WHERE playlist_id = ?")
            .bind(pid)
            .fetch_one(&db.pool)
            .await?;
    insert_item_at(db, pid, item, position).await
}

pub(crate) async fn insert_item_at(
    db: &Db,
    pid: &str,
    item: &NewImportedItem,
    position: i64,
) -> Result<PlaylistItem, Box<dyn std::error::Error>> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO items (id, playlist_id, source_item_id, title, url, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pid)
    .bind(&item.source_item_id)
    .bind(&item.title)
    .bind(&item.url)
    .bind(position)
    .bind(now_iso())
    .execute(&db.pool)
    .await?;

    Ok(PlaylistItem {
        id,
        playlist_id: pid.to_string(),
        source_item_id: item.source_item_id.clone(),
        title: item.title.clone(),
        url: item.url.clone(),
        position,
        topic: None,
        difficulty: None,
        duration_seconds: None,
        completed: false,
    })
}

/// Frontend payload for `add_item` (camelCase keys arrive from TS).
#[derive(serde::Deserialize)]
pub struct ItemPayload {
    pub title: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub source_item_id: Option<String>,
}

#[tauri::command]
pub async fn add_item(
    state: SharedDb<'_>,
    playlistId: String,
    item: ItemPayload,
) -> Result<PlaylistItem, String> {
    let mut db = state.lock().await;
    let inner = NewImportedItem {
        title: item.title,
        url: item.url,
        source_item_id: item.source_item_id,
    };
    insert_item(&db, &playlistId, &inner)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_item(state: SharedDb<'_>, itemId: String) -> Result<(), String> {
    let db = state.lock().await;
    sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(&itemId)
        .execute(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reorder_item(state: SharedDb<'_>, itemId: String, newPosition: i64) -> Result<(), String> {
    let mut db = state.lock().await;
    move_item(&mut db, &itemId, newPosition).await.map_err(|e| e.to_string())
}

pub(crate) async fn move_item(
    db: &mut Db,
    id: &str,
    pos: i64,
) -> Result<(), Box<dyn std::error::Error>> {
    let old: Option<(i64, String)> = sqlx::query_as(
        "SELECT position, playlist_id FROM items WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?;
    let (old_pos, pid) = old.ok_or("item not found")?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items WHERE playlist_id = ?")
        .bind(&pid)
        .fetch_one(&db.pool)
        .await?;
    if count == 0 {
        return Ok(());
    }
    let pos = pos.clamp(0, count - 1);
    if pos != old_pos {
        if pos > old_pos {
            sqlx::query(
                "UPDATE items SET position = position - 1
                  WHERE playlist_id = ? AND position > ? AND position <= ?",
            )
            .bind(&pid)
            .bind(old_pos)
            .bind(pos)
            .execute(&db.pool)
            .await?;
        } else {
            sqlx::query(
                "UPDATE items SET position = position + 1
                  WHERE playlist_id = ? AND position >= ? AND position < ?",
            )
            .bind(&pid)
            .bind(pos)
            .bind(old_pos)
            .execute(&db.pool)
            .await?;
        }
        sqlx::query("UPDATE items SET position = ? WHERE id = ?")
            .bind(pos)
            .bind(id)
            .execute(&db.pool)
            .await?;
    }
    // A reordering may change which items come next — replan the future.
    let _ = crate::scheduler::rebuild(db, Some(&pid)).await;
    Ok(())
}

#[tauri::command]
pub async fn import_playlist(state: SharedDb<'_>, input: ImportInput) -> Result<Playlist, String> {
    let preview =
        crate::commands::youtube::fetch_playlist(&input.url).await.map_err(|e| e.to_string())?;

    let mut db = state.lock().await;
    let patch = PlaylistPatch {
        title: Some(input.title.clone().unwrap_or_else(|| preview.title.clone())),
        source_url: Some(input.url.clone()),
        source_type: Some(PlaylistSource::Youtube),
        task_type: Some(input.task_type),
        daily_target: Some(input.daily_target.max(1)),
        max_daily_items: None,
        ordering_policy: Some(input.ordering_policy),
        planning_mode: None,
        color: None,
    };
    let pl = db_create_playlist(&mut db, patch).await.map_err(|e| e.to_string())?;
    let mut position = 0i64;
    for it in &preview.items {
        insert_item_at(
            &db,
            &pl.id,
            &NewImportedItem {
                title: it.title.clone(),
                url: Some(it.url.clone()),
                source_item_id: it.source_item_id.clone(),
            },
            position,
        )
        .await
        .map_err(|e| e.to_string())?;
        position += 1;
    }
    let _ = crate::scheduler::rebuild(&db, Some(&pl.id)).await;
    Ok(pl)
}
