use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::{DateTime, Duration, Local};
use serde::Serialize;


use super::playlists::SharedDb;
use crate::db::today_key;
use crate::models::*;

fn date_key_of(iso: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

#[derive(Default)]
struct Event {
    item_id: String,
    playlist_id: String,
    at: String,
}

struct CompletionRow;

#[tauri::command]
pub async fn get_streaks(state: SharedDb<'_>) -> Result<StreakStats, String> {
    let db = state.lock().await;
    compute_streaks(&db).await.map_err(|e| e.to_string())
}

pub(crate) async fn compute_streaks(db: &crate::db::Db) -> Result<StreakStats, Box<dyn std::error::Error>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT completed_at FROM completion_events ORDER BY completed_at")
            .fetch_all(&db.pool)
            .await?;
    // Local-calendar qualifying days: >= 1 eligible completion event.
    let mut days: HashSet<String> = HashSet::new();
    for (at,) in rows {
        if let Some(k) = date_key_of(&at) {
            days.insert(k);
        }
    }
    let today = today_key();
    let yesterday =
        (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string();

    let mut current = 0i64;
    if days.contains(&today) || days.contains(&yesterday) {
        let mut probe = if days.contains(&today) { 0 } else { 1 };
        while days.contains(
            &(Local::now() - Duration::days(probe))
                .format("%Y-%m-%d")
                .to_string(),
        ) {
            current += 1;
            probe += 1;
        }
    }

    let mut sorted: Vec<String> = days.into_iter().collect();
    sorted.sort();
    let mut best = 0i64;
    let mut run = 0i64;
    let mut prev: Option<chrono::NaiveDate> = None;
    for d in &sorted {
        let n = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")?;
        match prev {
            None => run = 1,
            Some(p) => {
                if (n - p).num_days() == 1 {
                    run += 1;
                } else {
                    run = 1;
                }
            }
        }
        best = best.max(run);
        prev = Some(n);
    }

    Ok(StreakStats {
        current_streak: current,
        best_streak: best.max(current),
        qualifying_days_total: sorted.len() as i64,
        last_completed_date: sorted.last().cloned(),
    })
}

#[tauri::command]
pub async fn get_heatmap(state: SharedDb<'_>, days: i64) -> Result<HeatmapData, String> {
    let db = state.lock().await;
    heatmap(&db, days).await.map_err(|e| e.to_string())
}

pub(crate) async fn heatmap(db: &crate::db::Db, days: i64) -> Result<HeatmapData, Box<dyn std::error::Error>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT completed_at FROM completion_events")
            .fetch_all(&db.pool)
            .await?;
    let mut by_day: BTreeMap<String, i64> = BTreeMap::new();
    for (at,) in rows {
        if let Some(k) = date_key_of(&at) {
            *by_day.entry(k).or_default() += 1;
        }
    }
    let planned: Vec<(String, i64)> =
        sqlx::query_as("SELECT planned_date, COUNT(*) FROM scheduled_tasks GROUP BY planned_date")
            .fetch_all(&db.pool)
            .await?;
    let planned_map: HashMap<String, i64> = planned.into_iter().collect();

    let mut out = Vec::with_capacity(days as usize);
    for i in (1..=days).rev() {
        let key = (Local::now() - Duration::days(i - 1))
            .format("%Y-%m-%d")
            .to_string();
        out.push(DayCompletion {
            date: key.clone(),
            completed: *by_day.get(&key).unwrap_or(&0),
            planned: *planned_map.get(&key).unwrap_or(&0),
        });
    }
    Ok(HeatmapData { days: out })
}

#[derive(Debug, Clone, Serialize)]
pub struct DayCount {
    pub date: String,
    pub completed: i64,
}

#[tauri::command]
pub async fn get_completions_by_day(
    state: SharedDb<'_>,
    days: i64,
) -> Result<Vec<DayCount>, String> {
    let db = state.lock().await;
    let h = heatmap(&db, days.clamp(1, 400)).await.map_err(|e| e.to_string())?;
    Ok(h.days
        .into_iter()
        .map(|d| DayCount {
            date: d.date,
            completed: d.completed,
        })
        .collect())
}

#[tauri::command]
pub async fn get_playlist_progress(
    state: SharedDb<'_>,
) -> Result<Vec<PlaylistProgress>, String> {
    let db = state.lock().await;
    progress(&db).await.map_err(|e| e.to_string())
}

pub(crate) async fn progress(db: &crate::db::Db) -> Result<Vec<PlaylistProgress>, Box<dyn std::error::Error>> {
    let playlists = db.load_playlists().await?;
    let today = today_key();

    // per-playlist recent completions from the append-only log
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT playlist_id, completed_at FROM completion_events")
            .fetch_all(&db.pool)
            .await?;
    let cutoff7 = (Local::now() - Duration::days(7)).format("%Y-%m-%d").to_string();
    let cutoff30 = (Local::now() - Duration::days(30)).format("%Y-%m-%d").to_string();
    let mut by_playlist: HashMap<String, Vec<String>> = HashMap::new();
    for (pid, at) in rows {
        if let Some(k) = date_key_of(&at) {
            by_playlist.entry(pid).or_default().push(k);
        }
    }

    let overdue: Vec<(String, i64)> = sqlx::query_as(
        "SELECT playlist_id, COUNT(*) FROM scheduled_tasks
          WHERE status = 'pending' AND planned_date < ?
          GROUP BY playlist_id",
    )
    .bind(&today)
    .fetch_all(&db.pool)
    .await?;
    let overdue_map: HashMap<String, i64> = overdue.into_iter().collect();

    let mut out = Vec::with_capacity(playlists.len());
    for p in playlists {
        let days: Vec<String> = by_playlist.get(&p.id).cloned().unwrap_or_default();
        let total = p.item_count.max(1);
        out.push(PlaylistProgress {
            completion_rate: (p.completed_count as f64 / total as f64).min(1.0),
            total_items: p.item_count,
            completed_items: p.completed_count,
            completed_last_7: days.iter().filter(|d| d.as_str() >= cutoff7.as_str()).count() as i64,
            completed_last_30: days.iter().filter(|d| d.as_str() >= cutoff30.as_str()).count() as i64,
            overdue: *overdue_map.get(&p.id).unwrap_or(&0),
            playlist: p,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_dashboard(state: SharedDb<'_>) -> Result<DashboardData, String> {
    let db = state.lock().await;
    dashboard(&db).await.map_err(|e| e.to_string())
}

pub(crate) async fn dashboard(db: &crate::db::Db) -> Result<DashboardData, Box<dyn std::error::Error>> {
    let today = today_key();
    let yesterday = (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string();

    let today_plan = super::tasks::load_plan(db, &today).await?;
    let yesterday_plan = super::tasks::load_plan(db, &yesterday).await?;

    let completed_today = today_plan.tasks.iter().filter(|t| matches!(t.status, TaskStatus::Completed)).count() as i64;
    let planned_today = today_plan.tasks.len() as i64;

    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT completed_at FROM completion_events").fetch_all(&db.pool).await?;
    let cutoff = (Local::now() - Duration::days(7)).format("%Y-%m-%d").to_string();
    let weekly = rows
        .into_iter()
        .filter(|(at,)| date_key_of(at).is_some_and(|k| k >= cutoff))
        .count() as i64;

    let streak = compute_streaks(db).await?;

    Ok(DashboardData {
        weekly_completions: weekly,
        planned_today,
        completed_today,
        all_done: planned_today > 0 && completed_today == planned_today,
        today: today_plan,
        yesterday: yesterday_plan,
        streak,
    })
}
