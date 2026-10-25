use std::collections::{HashMap, HashSet, VecDeque};

use chrono::{Duration, Local};
use sqlx::sqlite::SqliteRow;
use sqlx::Row;

use crate::db::{today_key, Db};
use crate::models::*;

/// Deterministic, AI-free scheduler with cross-playlist difficulty balance.
///
/// Invariants enforced here (see blueprint §6):
///   1. Completed work is never touched — completion_events is append-only and
///      replanning cannot delete any task row whose status is 'completed'.
///   2. Strict sequence never reorders: items are consumed in `position` order
///      per playlist, so subject N can never jump ahead of N-1.
///   3. User-locked tasks keep their dates and consume capacity.
///   4. Missed days: unlocked overdue tasks are carried forward into free
///      capacity, in original assignment order, before fresh items are added.
///   5. Replanning is transactional and versioned (plans table).
///
/// Two passes make the plan feel considered rather than mechanical:
///   * strict videos are placed first, day by day, so their weight for each
///     day is known;
///   * flexible playlists then fill their quota with the item whose difficulty
///     best balances that day — an easy problem next to a hard lecture, a
///     harder one on a day that is otherwise light. Difficulty comes from the
///     companion's ordering; unlabelled playlists degrade to plain order.
/// The horizon is derived from the work itself (with the settings value as a
/// floor), so a 60-video course is planned to completion instead of ending at
/// an arbitrary three weeks.
pub async fn rebuild(db: &Db, playlist_filter: Option<&str>) -> Result<PlanDiff, Box<dyn std::error::Error>> {
    let settings = db.settings().await?;
    let today = today_key();

    let mut tx = db.pool.begin().await?;

    let playlists = load_playlists_tx(&mut tx, playlist_filter).await?;

    let mut diff = PlanDiff {
        version: bump_plan_version(&mut tx, "difficulty-balanced").await?,
        ..Default::default()
    };

    /* ----------------------- 1. collect the work ----------------------- */

    struct Work {
        id: String,
        target: i64,
        strict: bool,
        /// Unfinished items in their intended order.
        queue: VecDeque<ItemRow>,
        /// Overdue task ids, carried forward in their original order.
        overdue: VecDeque<String>,
        /// Tasks already on each date (locked anchors and everything we place).
        assigned: HashMap<String, i64>,
        /// The first item of a flexible playlist keeps its place.
        picked_any: bool,
    }

    let mut work: Vec<Work> = Vec::new();

    for playlist in playlists {
        diff.playlist_id.get_or_insert_with(|| playlist.id.clone());

        let all_pending = pending_tasks_tx(&mut tx, &playlist.id).await?;
        let completed_items = db_completed_items(&mut tx, &playlist.id).await?;

        let mut overdue_rows: Vec<&ScheduledRow> = all_pending
            .iter()
            .filter(|t| !t.locked && t.planned_date.as_str() < today.as_str())
            .collect();
        overdue_rows.sort_by(|a, b| {
            a.planned_date
                .cmp(&b.planned_date)
                .then(a.office_position.cmp(&b.office_position))
        });

        let anchored_items: HashSet<String> = all_pending
            .iter()
            .filter(|t| t.locked || t.planned_date.as_str() < today.as_str())
            .map(|t| t.item_id.clone())
            .collect();

        let mut assigned: HashMap<String, i64> = HashMap::new();
        for t in all_pending.iter().filter(|t| t.locked) {
            *assigned.entry(t.planned_date.clone()).or_default() += 1;
        }

        // Unlocked future assignments are discarded and replanned.
        for t in all_pending
            .iter()
            .filter(|t| !t.locked && t.planned_date.as_str() >= today.as_str())
        {
            sqlx::query("DELETE FROM scheduled_tasks WHERE id = ? AND locked = 0 AND status = 'pending'")
                .bind(&t.id)
                .execute(&mut *tx)
                .await?;
            diff.dropped += 1;
        }

        let mut queue: VecDeque<ItemRow> = VecDeque::new();
        for it in items_tx(&mut tx, &playlist.id).await? {
            if completed_items.contains(&it.id) || anchored_items.contains(&it.id) {
                continue;
            }
            queue.push_back(it);
        }

        work.push(Work {
            id: playlist.id,
            target: playlist.daily_target.max(1),
            strict: matches!(playlist.ordering_policy, OrderingPolicy::Strict),
            queue,
            overdue: overdue_rows.iter().map(|t| t.id.clone()).collect(),
            assigned,
            picked_any: false,
        });
    }

    /* --------------------- 2. horizon from the work --------------------- */

    let needed_days = work
        .iter()
        .map(|w| {
            let remaining = (w.queue.len() + w.overdue.len()) as i64;
            (remaining + w.target - 1) / w.target
        })
        .max()
        .unwrap_or(0);

    let horizon = settings.daily_horizon_days.max(needed_days).clamp(7, 365) as usize;
    let dates: Vec<String> = (0..horizon)
        .map(|i| (Local::now() + Duration::days(i as i64)).format("%Y-%m-%d").to_string())
        .collect();

    // A single-playlist rebuild still has to know how heavy the other days
    // already are, or the balance would ignore every other playlist.
    let mut baseline: HashMap<String, i64> = HashMap::new();
    if let Some(id) = playlist_filter {
        let rows: Vec<SqliteRow> = sqlx::query(
            "SELECT planned_date, COUNT(*) FROM scheduled_tasks
              WHERE playlist_id != ? AND status = 'pending' GROUP BY planned_date",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
        for row in rows {
            baseline.insert(row.get(0), row.get(1));
        }
    }

    /* -------------- 3. pass one: carry-over, then strict order ------------- */

    for date in &dates {
        // Missed work first: nothing is stranded behind the calendar.
        for w in work.iter_mut() {
            let mut filled = *w.assigned.get(date).unwrap_or(&0);
            while filled < w.target {
                let Some(task_id) = w.overdue.pop_front() else {
                    break;
                };
                sqlx::query(
                    "UPDATE scheduled_tasks SET planned_date = ?, office_position = ? WHERE id = ?",
                )
                .bind(date)
                .bind(filled)
                .bind(&task_id)
                .execute(&mut *tx)
                .await?;
                *w.assigned.entry(date.clone()).or_default() += 1;
                diff.moved += 1;
                filled += 1;
            }
        }

        // Strict playlists keep their exact sequence.
        for w in work.iter_mut().filter(|w| w.strict) {
            let mut filled = *w.assigned.get(date).unwrap_or(&0);
            while filled < w.target {
                let Some(item) = w.queue.front() else {
                    break;
                };
                insert_task(&mut tx, &item.id, &w.id, date, filled).await?;
                w.queue.pop_front();
                *w.assigned.entry(date.clone()).or_default() += 1;
                diff.added += 1;
                filled += 1;
            }
        }
    }

    /* ---------- 4. pass two: flexible items against each day's load ---------- */

    for date in &dates {
        let mut day_load: i64 = baseline.get(date).copied().unwrap_or(0)
            + work
                .iter()
                .map(|w| *w.assigned.get(date).unwrap_or(&0))
                .sum::<i64>();

        for w in work.iter_mut().filter(|w| !w.strict) {
            let mut filled = *w.assigned.get(date).unwrap_or(&0);
            while filled < w.target && !w.queue.is_empty() {
                // Heavy day → reach for something easier; light day → harder.
                let wanted = (5 - day_load).clamp(1, 5);
                let idx = if w.picked_any {
                    let mut best: Option<(i64, i64, usize)> = None;
                    for (i, item) in w.queue.iter().enumerate() {
                        let key = (
                            (item.difficulty.unwrap_or(3) - wanted).abs(),
                            item.position,
                        );
                        if best.map(|b| key < (b.0, b.1)).unwrap_or(true) {
                            best = Some((key.0, key.1, i));
                        }
                    }
                    best.map(|b| b.2).unwrap_or(0)
                } else {
                    // First unfinished item stays first: the learner may be
                    // mid-topic and a jump here would feel arbitrary.
                    0
                };

                let Some(item) = w.queue.remove(idx) else {
                    break;
                };
                insert_task(&mut tx, &item.id, &w.id, date, filled).await?;
                w.picked_any = true;
                *w.assigned.entry(date.clone()).or_default() += 1;
                day_load += 1;
                diff.added += 1;
                filled += 1;
            }
        }
    }

    tx.commit().await?;
    Ok(diff)
}

async fn insert_task(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    item_id: &str,
    playlist_id: &str,
    date: &str,
    position: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO scheduled_tasks
           (id, item_id, playlist_id, planned_date, status, locked, office_position, created_at)
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(item_id)
    .bind(playlist_id)
    .bind(date)
    .bind(position)
    .bind(now_iso())
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Lighter startup pass: identical rules, but only runs daily (no-op when
/// today's quota for every playlist is already scheduled).
pub async fn autoheal(db: &Db) -> Result<(), Box<dyn std::error::Error>> {
    let has_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE planned_date = ? AND status = 'pending'",
    )
    .bind(today_key())
    .fetch_one(&db.pool)
    .await?;

    let empty_playlists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM playlists p
          WHERE (SELECT COUNT(*) FROM items i WHERE i.playlist_id = p.id)
              > (SELECT COUNT(DISTINCT c.item_id) FROM completion_events c WHERE c.playlist_id = p.id)
            AND NOT EXISTS (
              SELECT 1 FROM scheduled_tasks s
               WHERE s.playlist_id = p.id AND s.planned_date >= ? AND s.status = 'pending'
            )",
    )
    .bind(today_key())
    .fetch_one(&db.pool)
    .await?;

    // Missed days: any pending task left in the past means yesterday's quota
    // was not finished. Rebuilding carries it into today's free capacity
    // instead of leaving it stranded behind the calendar.
    let overdue: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE status = 'pending' AND planned_date < ?",
    )
    .bind(today_key())
    .fetch_one(&db.pool)
    .await?;

    if has_today == 0 || empty_playlists > 0 || overdue > 0 {
        rebuild(db, None).await?;
    }
    Ok(())
}

/* ------------------------------------------------------------- helpers */

struct ItemRow {
    id: String,
    position: i64,
    difficulty: Option<i64>,
}

struct ScheduledRow {
    id: String,
    item_id: String,
    planned_date: String,
    locked: bool,
    office_position: i64,
}

pub async fn bump_plan_version(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    strategy: &str,
) -> Result<i64, Box<dyn std::error::Error>> {
    sqlx::query(
        "INSERT INTO plans (id, start_date, strategy, version, created_at)
         VALUES (?, ?, ?, 0, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(today_key())
    .bind(strategy)
    .bind(now_iso())
    .execute(&mut **tx)
    .await?;
    let v: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM plans").fetch_one(&mut **tx).await?;
    sqlx::query("UPDATE plans SET version = ? WHERE rowid = (SELECT rowid FROM plans ORDER BY rowid DESC LIMIT 1)")
        .bind(v)
        .execute(&mut **tx)
        .await?;
    Ok(v)
}

async fn load_playlists_tx(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    filter: Option<&str>,
) -> Result<Vec<Playlist>, Box<dyn std::error::Error>> {
    let rows: Vec<SqliteRow> = match filter {
        Some(id) => {
            sqlx::query(
                "SELECT id, title, daily_target, ordering_policy FROM playlists WHERE id = ?",
            )
            .bind(id)
            .fetch_all(&mut **tx)
            .await?
        }
        None => {
            sqlx::query(
                "SELECT id, title, daily_target, ordering_policy FROM playlists ORDER BY created_at ASC",
            )
            .fetch_all(&mut **tx)
            .await?
        }
    };
    Ok(rows
        .into_iter()
        .map(|r| Playlist {
            id: r.get::<String, _>(0),
            title: r.get::<String, _>(1),
            source_url: None,
            source_type: PlaylistSource::Manual,
            task_type: TaskType::Mixed,
            daily_target: r.get::<i64, _>(2),
            max_daily_items: None,
            ordering_policy: serde_json::from_str(&r.get::<String, _>(3)).unwrap_or(OrderingPolicy::Strict),
            planning_mode: PlanningMode::Sequential,
            color: None,
            created_at: String::new(),
            item_count: 0,
            completed_count: 0,
        })
        .collect())
}

async fn items_tx(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    playlist_id: &str,
) -> Result<Vec<ItemRow>, Box<dyn std::error::Error>> {
    let rows: Vec<SqliteRow> =
        sqlx::query("SELECT id, position, difficulty FROM items WHERE playlist_id = ? ORDER BY position ASC")
            .bind(playlist_id)
            .fetch_all(&mut **tx)
            .await?;
    Ok(rows
        .into_iter()
        .map(|r| ItemRow {
            id: r.get(0),
            position: r.get(1),
            difficulty: r.get(2),
        })
        .collect())
}

/// Read task rows as SqliteRows first, then materialize structs
/// (borrow checker: cannot hold row borrows across the await points below).
/// Completed tasks are excluded — they are immutable.
async fn pending_tasks_tx(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    playlist_id: &str,
) -> Result<Vec<ScheduledRow>, Box<dyn std::error::Error>> {
    let rows: Vec<SqliteRow> = sqlx::query(
        "SELECT id, item_id, planned_date, locked, office_position
           FROM scheduled_tasks
          WHERE playlist_id = ? AND status != 'completed'",
    )
    .bind(playlist_id)
    .fetch_all(&mut **tx)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| ScheduledRow {
            id: r.get(0),
            item_id: r.get(1),
            planned_date: r.get(2),
            locked: r.get::<i64, _>(3) != 0,
            office_position: r.get(4),
        })
        .collect())
}

/// View helper defined once for all schedulers: distinct items completed
/// for a playlist, sourced from the append-only event log.
pub async fn completed_items_for(
    conn: &mut sqlx::SqliteConnection,
    playlist_id: &str,
) -> Result<HashSet<String>, Box<dyn std::error::Error>> {
    let rows: Vec<SqliteRow> =
        sqlx::query("SELECT DISTINCT item_id FROM completion_events WHERE playlist_id = ?")
            .bind(playlist_id)
            .fetch_all(conn)
            .await?;
    Ok(rows.into_iter().map(|r| r.get::<String, _>(0)).collect())
}

async fn db_completed_items(
    tx: &mut sqlx::Transaction<'static, sqlx::Sqlite>,
    playlist_id: &str,
) -> Result<HashSet<String>, Box<dyn std::error::Error>> {
    completed_items_for(&mut **tx, playlist_id).await
}
