//! AI-assisted ordering for flexible playlists.
//!
//! The deterministic scheduler never depends on this module: it only
//! rearranges `items.position` (and labels topic/difficulty) and then asks
//! the ordinary scheduler to replan. Strict playlists are refused, because
//! for a course the sequence *is* the content.

use serde::Serialize;
use sqlx::Row;

use super::playlists::SharedDb;
use crate::ai;
use crate::models::ChatMessage;

#[derive(Debug, Default, Serialize)]
pub struct PlanOrderResult {
    /// Unfinished items that ended up in a new position.
    pub moved: i64,
    /// Items the model labelled with a topic (and difficulty, when given).
    pub labelled: i64,
    /// Distinct topic clusters found, used by the UI toast.
    pub clusters: i64,
    pub note: String,
}

struct RowItem {
    id: String,
    title: String,
    topic: Option<String>,
    difficulty: Option<i64>,
}

#[tauri::command]
pub async fn ai_reorder_playlist(
    state: SharedDb<'_>,
    playlistId: String,
) -> Result<PlanOrderResult, String> {
    // 1. Read what we need, then release the lock: an HTTP round trip must
    //    never hold the database mutex.
    let (cfg, title, items) = {
        let db = state.lock().await;
        let cfg = db.ai_config().await;
        if !(cfg.enabled && !cfg.api_key.trim().is_empty()) {
            return Err(
                "No AI provider is configured. Add one in Settings → AI, or keep the sequential plan."
                    .into(),
            );
        }

        let row = sqlx::query("SELECT title, ordering_policy FROM playlists WHERE id = ?")
            .bind(&playlistId)
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That playlist no longer exists.".to_string())?;

        let title: String = row.try_get(0).map_err(|e| e.to_string())?;
        let policy: String = row.try_get(1).map_err(|e| e.to_string())?;
        if policy.contains("strict") {
            return Err(
                "This playlist is set to strict sequence, so its order is part of the course. \
                 Switch it to flexible first if you want the companion to rearrange it."
                    .into(),
            );
        }

        let rows = sqlx::query(
            "SELECT i.id, i.title, i.topic, i.difficulty
               FROM items i
              WHERE i.playlist_id = ?
                AND NOT EXISTS (SELECT 1 FROM completion_events c WHERE c.item_id = i.id)
              ORDER BY i.position ASC",
        )
        .bind(&playlistId)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

        let items: Vec<RowItem> = rows
            .into_iter()
            .map(|r| RowItem {
                id: r.get(0),
                title: r.get(1),
                topic: r.get(2),
                difficulty: r.get(3),
            })
            .collect();

        (cfg, title, items)
    };

    if items.len() < 2 {
        return Ok(PlanOrderResult {
            note: "Not enough unfinished items to reorder.".into(),
            ..Default::default()
        });
    }

    // 2. Ask the model for a topic-clustered, difficulty-ramped order.
    //    Cap the batch: a 400-video course would blow the context window and
    //    the reply budget. The tail keeps its relative order after this batch.
    let batch: Vec<&RowItem> = items.iter().take(80).collect();
    let list = batch
        .iter()
        .map(|i| format!("- {} | {}", i.id, i.title))
        .collect::<Vec<_>>()
        .join("\n");

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "You are planning the order of a developer study playlist. Group related \
                      topics together, place fundamentals before anything that depends on them, \
                      and ramp difficulty up inside each topic. Keep the first unfinished item \
                      first: the learner may already be part-way through that topic. \
                      Reply with ONLY a JSON array, in final order, of objects with keys \
                      \"id\" (must be one of the supplied ids), \"topic\" (2-3 words) and \
                      \"difficulty\" (integer 1-5). Include every id exactly once. Never invent ids."
                .into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!(
                "Playlist: {title}\nUnfinished items, currently in playlist order:\n{list}"
            ),
        },
    ];

    let raw = ai::chat_with_budget(&cfg, &messages, 5000).await?;
    let parsed = ai::parse_json_array(&raw)?;
    let arr = parsed
        .as_array()
        .cloned()
        .or_else(|| parsed.get("items").and_then(|v| v.as_array()).cloned())
        .ok_or_else(|| "The model did not return a list of items.".to_string())?;

    let mut requested: Vec<(String, Option<String>, Option<i64>)> = Vec::new();
    for entry in arr {
        let id = entry["id"].as_str().unwrap_or_default().to_string();
        if id.is_empty() || !items.iter().any(|i| i.id == id) {
            continue;
        }
        if requested.iter().any(|(seen, _, _)| *seen == id) {
            continue;
        }
        let topic = entry["topic"].as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let difficulty = entry["difficulty"].as_i64().map(|d| d.clamp(1, 5));
        requested.push((id, topic, difficulty));
    }

    // Anything the model left out keeps its original relative order at the
    // end. Losing an item here would silently drop it from the plan.
    for item in &items {
        if !requested.iter().any(|(id, _, _)| *id == item.id) {
            requested.push((item.id.clone(), item.topic.clone(), item.difficulty));
        }
    }

    if requested.is_empty() {
        return Err("The model returned no usable order; the existing plan was kept.".into());
    }

    // 3. Write the new order into the slots the unfinished items occupied,
    //    then replan. Done in one transaction so a crash cannot scramble the
    //    playlist halfway.
    let mut db = state.lock().await;
    let mut tx = db.pool.begin().await.map_err(|e| e.to_string())?;

    let slots: Vec<i64> = sqlx::query_scalar(
        "SELECT i.position FROM items i
          WHERE i.playlist_id = ?
            AND NOT EXISTS (SELECT 1 FROM completion_events c WHERE c.item_id = i.id)
          ORDER BY i.position ASC",
    )
    .bind(&playlistId)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut moved = 0i64;
    let mut labelled = 0i64;
    let mut topics: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (idx, (id, topic, difficulty)) in requested.iter().enumerate() {
        let Some(position) = slots.get(idx) else { break };
        sqlx::query(
            "UPDATE items SET position = ?, topic = COALESCE(?, topic), \
                              difficulty = COALESCE(?, difficulty) WHERE id = ?",
        )
        .bind(position)
        .bind(topic.as_deref())
        .bind(*difficulty)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if topic.is_some() {
            labelled += 1;
            topics.insert(topic.clone().unwrap_or_default().to_lowercase());
        }
        if let Some(original) = items.iter().position(|i| i.id == *id) {
            if original != idx {
                moved += 1;
            }
        }
    }

    sqlx::query("UPDATE playlists SET planning_mode = '\"ai\"' WHERE id = ?")
        .bind(&playlistId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = crate::scheduler::rebuild(&mut db, Some(&playlistId)).await;

    let clusters = topics.len() as i64;
    let note = if clusters > 0 {
        format!(
            "Ordered {moved} of {} items into {clusters} topic clusters.",
            requested.len()
        )
    } else {
        format!("Ordered {} unfinished items.", requested.len())
    };

    Ok(PlanOrderResult {
        moved,
        labelled,
        clusters,
        note,
    })
}

/* --------------------------- whole-plan review --------------------------- */

#[derive(Debug, Default, Serialize)]
pub struct AiPlanOptimize {
    /// Flexible items whose position changed.
    pub moved: i64,
    /// Flexible playlists that were reviewed.
    pub playlists: i64,
    pub note: String,
}

struct FlexItem {
    id: String,
    title: String,
    position: i64,
    topic: Option<String>,
    difficulty: Option<i64>,
}

struct FlexList {
    id: String,
    title: String,
    target: i64,
    items: Vec<FlexItem>,
}

/// Reviews the *whole* plan, not one playlist: the model sees how heavy every
/// upcoming day already is (strict lectures and other fixed work), then orders
/// each flexible playlist so its load lands on the right days. The scheduler
/// still owns the final dates, so a skipped day re-balances as usual.
#[tauri::command]
pub async fn ai_optimize_plan(state: SharedDb<'_>) -> Result<AiPlanOptimize, String> {
    optimize_plan(state.inner()).await
}

/// The engine behind the command, callable from the maintenance CLI
/// (`foxstudy --optimize`) without a window.
pub async fn optimize_plan(shared: &crate::AppDb) -> Result<AiPlanOptimize, String> {
    let (cfg, lists, day_lines) = {
        let db = shared.lock().await;
        let cfg = db.ai_config().await;
        if !(cfg.enabled && !cfg.api_key.trim().is_empty()) {
            return Err(
                "No AI provider is configured. Add one in Settings → AI, or use Rebuild for the \
                 deterministic plan."
                    .into(),
            );
        }

        let rows = sqlx::query(
            "SELECT p.id, p.title, p.daily_target, i.id, i.title, i.position, i.topic, i.difficulty
               FROM playlists p
               JOIN items i ON i.playlist_id = p.id
              WHERE p.ordering_policy LIKE '%flexible%'
                AND NOT EXISTS (SELECT 1 FROM completion_events c WHERE c.item_id = i.id)
              ORDER BY p.created_at ASC, i.position ASC",
        )
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut lists: Vec<FlexList> = Vec::new();
        for r in rows {
            let pid: String = r.get(0);
            let ptitle: String = r.get(1);
            let target: i64 = r.get(2);
            if !lists.iter().any(|l| l.id == pid) {
                if lists.len() >= 8 {
                    continue;
                }
                lists.push(FlexList {
                    id: pid.clone(),
                    title: ptitle,
                    target,
                    items: Vec::new(),
                });
            }
            if let Some(list) = lists.iter_mut().find(|l| l.id == pid) {
                if list.items.len() >= 60 {
                    continue;
                }
                list.items.push(FlexItem {
                    id: r.get(3),
                    title: r.get(4),
                    position: r.get(5),
                    topic: r.get(6),
                    difficulty: r.get(7),
                });
            }
        }

        let load_rows = sqlx::query(
            "SELECT t.planned_date, p.title, COUNT(*)
               FROM scheduled_tasks t
               JOIN playlists p ON p.id = t.playlist_id
              WHERE t.status = 'pending' AND t.planned_date >= date('now')
              GROUP BY t.planned_date, p.id
              ORDER BY t.planned_date ASC
             LIMIT 90",
        )
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut by_day: std::collections::BTreeMap<String, Vec<(String, i64)>> =
            std::collections::BTreeMap::new();
        for r in load_rows {
            let date: String = r.get(0);
            let title: String = r.get(1);
            let count: i64 = r.get(2);
            by_day.entry(date).or_default().push((title, count));
        }
        let day_lines: Vec<String> = by_day
            .into_iter()
            .take(60)
            .map(|(date, parts)| {
                let total: i64 = parts.iter().map(|(_, c)| *c).sum();
                let detail = parts
                    .iter()
                    .map(|(t, c)| if *c > 1 { format!("{t} ×{c}") } else { t.clone() })
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("- {date} · {total} task(s): {detail}")
            })
            .collect();

        (cfg, lists, day_lines)
    };

    if lists.is_empty() {
        return Ok(AiPlanOptimize {
            note: "No flexible playlists with unfinished items — nothing to rearrange.".into(),
            ..Default::default()
        });
    }

    let mut last_error = String::new();
    let mut value = serde_json::Value::Null;
    // Two attempts with a smaller batch: some gateways choke on a long JSON
    // request but handle a short one, and a partial re-order is still useful.
    for (cap, tokens, secs) in [(30usize, 3000u32, 120u64), (12, 1500, 90)] {
        let messages = build_plan_prompt(&day_lines, &lists, cap);
        match ai::chat_with_timeout(&cfg, &messages, tokens, secs).await {
            Ok(raw) => match extract_json_object(&raw) {
                Some(parsed) => {
                    value = parsed;
                    break;
                }
                None => last_error = "the reply was not JSON".into(),
            },
            Err(e) => last_error = e,
        }
    }

    if value.is_null() {
        return Err(format!(
            "The companion did not return a usable plan ({last_error}). Try again, or use Rebuild \
             for the deterministic balance."
        ));
    }

    let orders = value
        .get("orders")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let reason = value
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("Balanced flexible work against the fixed load of each day.")
        .trim()
        .chars()
        .take(220)
        .collect::<String>();

    let mut db = shared.lock().await;
    let mut tx = db.pool.begin().await.map_err(|e| e.to_string())?;
    let mut moved = 0i64;
    let mut touched = 0i64;

    let mut claimed: Vec<usize> = Vec::new();
    for list in &lists {
        // Prefer an order that names this playlist; otherwise take the next
        // unclaimed order (some models drop the id but keep the shapes).
        let found = orders
            .iter()
            .position(|o| o.get("playlist_id").and_then(|v| v.as_str()) == Some(list.id.as_str()))
            .or_else(|| {
                orders
                    .iter()
                    .enumerate()
                    .position(|(i, _)| !claimed.contains(&i))
            });
        let Some(idx) = found else { continue };
        claimed.push(idx);
        let order = &orders[idx];
        let Some(entries) = order.get("items").and_then(|v| v.as_array()) else {
            continue;
        };

        // Requested order, ids validated against this playlist.
        let mut ordered: Vec<(String, Option<i64>)> = Vec::new();
        for entry in entries {
            let id = entry
                .get("id")
                .or_else(|| entry.as_str().map(|_| entry))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if id.is_empty() || !list.items.iter().any(|i| i.id == id) {
                continue;
            }
            if ordered.iter().any(|(seen, _)| *seen == id) {
                continue;
            }
            let difficulty = entry
                .get("difficulty")
                .and_then(|d| d.as_i64())
                .map(|d| d.clamp(1, 5));
            ordered.push((id, difficulty));
        }
        // Anything omitted keeps its relative order at the end.
        for it in &list.items {
            if !ordered.iter().any(|(id, _)| *id == it.id) {
                ordered.push((it.id.clone(), it.difficulty));
            }
        }
        if ordered.is_empty() {
            continue;
        }
        // The first unfinished item never jumps: the learner may be mid-topic.
        if let Some(first) = list.items.first() {
            if let Some(pos) = ordered.iter().position(|(id, _)| *id == first.id) {
                let keep = ordered.remove(pos);
                ordered.insert(0, keep);
            }
        }

        let slots: Vec<i64> = sqlx::query_scalar(
            "SELECT i.position FROM items i
              WHERE i.playlist_id = ?
                AND NOT EXISTS (SELECT 1 FROM completion_events c WHERE c.item_id = i.id)
              ORDER BY i.position ASC",
        )
        .bind(&list.id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        for (idx, (id, difficulty)) in ordered.iter().enumerate() {
            let Some(position) = slots.get(idx) else { break };
            sqlx::query("UPDATE items SET position = ?, difficulty = COALESCE(?, difficulty) WHERE id = ?")
                .bind(position)
                .bind(*difficulty)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            if let Some(original) = list.items.iter().position(|i| i.id == *id) {
                if original != idx {
                    moved += 1;
                }
            }
        }

        sqlx::query("UPDATE playlists SET planning_mode = '\"ai\"' WHERE id = ?")
            .bind(&list.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        touched += 1;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Rebuild everything: the balance is global, so every day is re-derived.
    let _ = crate::scheduler::rebuild(&db, None).await;

    Ok(AiPlanOptimize {
        moved,
        playlists: touched,
        note: reason,
    })
}

/// Compact request: the day table plus at most `cap` items per playlist.
/// Smaller than the raw schedule on purpose — long JSON asks are what make
/// some gateways stall or answer in prose.
fn build_plan_prompt(day_lines: &[String], lists: &[FlexList], cap: usize) -> Vec<ChatMessage> {
    let mut item_blocks: Vec<String> = Vec::new();
    for list in lists {
        item_blocks.push(format!(
            "Playlist \"{}\" [playlist_id: {}] ({} per day, first item stays first):",
            list.title, list.id, list.target
        ));
        for it in list.items.iter().take(cap) {
            item_blocks.push(format!(
                "- {} | {} | topic: {} | difficulty: {}",
                it.id,
                it.title,
                it.topic.as_deref().unwrap_or("?"),
                it.difficulty
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| "unlabelled".into())
            ));
        }
        item_blocks.push(String::new());
    }

    vec![
        ChatMessage {
            role: "system".into(),
            content: "You optimise a multi-playlist study plan. Days that already carry a heavy \
                      lecture should get easier, shorter problems; lighter days should take the \
                      harder, concept-stretching ones. Keep related items near each other and keep \
                      the first item of each flexible playlist first. Judge difficulty from the \
                      titles, not only the supplied label.\n\
                      Reply with ONLY JSON: {\"orders\":[{\"playlist_id\":\"…\",\"items\":[{\"id\":\"…\",\
                      \"difficulty\":1-5}]}],\"reason\":\"one sentence\"}. Use only supplied ids, each \
                      exactly once, in final order. No prose, no code fences."
                .into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!(
                "Upcoming days and what they already carry:\n{}\n\nFlexible work to place:\n{}\n\nReturn the JSON object now.",
                day_lines.iter().take(21).cloned().collect::<Vec<_>>().join("\n"),
                item_blocks.join("\n")
            ),
        },
    ]
}

fn extract_json_object(raw: &str) -> Option<serde_json::Value> {
    if let Ok(v) = ai::parse_json_array(raw) {
        if v.is_object() {
            return Some(v);
        }
    }
    let trimmed = raw.trim();
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    serde_json::from_str::<serde_json::Value>(&trimmed[start..=end]).ok()
}
