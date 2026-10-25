//! AI layer: a single OpenAI-compatible gateway client (OmniRoute).
//!
//! Design rules:
//!  * No network call is ever made unless the user configured a provider.
//!  * The key lives in the local SQLite file, never in the frontend bundle.
//!  * Every failure returns a human-readable string; callers show it as-is.

use std::time::Duration;

use sqlx::Row;

use crate::commands::youtube::YOUTUBE_WEB_KEY;
use crate::db::Db;
use crate::models::{AiConfig, AiStatus, ChatMessage};

const AI_CONFIG_KEY: &str = "ai_config";

impl Db {
    pub async fn ai_config(&self) -> AiConfig {
        let raw: Option<String> =
            sqlx::query_scalar("SELECT value FROM app_settings WHERE key = ?")
                .bind(AI_CONFIG_KEY)
                .fetch_optional(&self.pool)
                .await
                .ok()
                .flatten();
        raw.and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub async fn save_ai_config(&self, cfg: &AiConfig) -> Result<(), String> {
        let raw = serde_json::to_string(cfg).map_err(|e| e.to_string())?;
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(AI_CONFIG_KEY)
        .bind(raw)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn ai_status(&self) -> AiStatus {
        let cfg = self.ai_config().await;
        AiStatus {
            configured: cfg.enabled && !cfg.api_key.trim().is_empty(),
            model: cfg.model,
            base_url: cfg.base_url,
        }
    }
}

pub async fn chat(cfg: &AiConfig, messages: &[ChatMessage]) -> Result<String, String> {
    chat_with_budget(cfg, messages, 1200).await
}

pub async fn chat_with_budget(
    cfg: &AiConfig,
    messages: &[ChatMessage],
    max_tokens: u32,
) -> Result<String, String> {
    chat_with_timeout(cfg, messages, max_tokens, 90).await
}

/// Generation jobs write long artifacts through slower gateways, so they get
/// a wider window than an interactive reply before the job is failed.
pub async fn chat_for_generation(
    cfg: &AiConfig,
    messages: &[ChatMessage],
    max_tokens: u32,
) -> Result<String, String> {
    chat_with_timeout(cfg, messages, max_tokens, 240).await
}

pub async fn chat_with_timeout(
    cfg: &AiConfig,
    messages: &[ChatMessage],
    max_tokens: u32,
    timeout_secs: u64,
) -> Result<String, String> {
    if cfg.base_url.trim().is_empty() {
        return Err("No gateway URL set. Add your OmniRoute endpoint in Settings → AI.".into());
    }
    if cfg.api_key.trim().is_empty() {
        return Err("No API key set. Add one in Settings → AI to enable AI features.".into());
    }
    if !cfg.enabled {
        return Err("AI is switched off in Settings → AI.".into());
    }

    let url = format!(
        "{}/chat/completions",
        cfg.base_url.trim().trim_end_matches('/')
    );
    let body = serde_json::json!({
        "model": if cfg.model.trim().is_empty() { "gpt-4o-mini" } else { cfg.model.trim() },
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": max_tokens,
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client could not start: {e}"))?;

    let resp = client
        .post(&url)
        .bearer_auth(cfg.api_key.trim())
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("The gateway timed out after {timeout_secs}s.")
            } else if e.is_connect() {
                format!("Could not reach {url}. Check the gateway URL and your network.")
            } else {
                format!("Request failed: {e}")
            }
        })?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Gateway returned {status}: {}", clip(&text, 240)));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Gateway sent invalid JSON: {e}"))?;

    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Unexpected gateway response: {}", clip(&text, 240)))
}

/// A cheap round-trip used by the settings screen's "Test connection".
pub async fn test_connection(cfg: &AiConfig) -> Result<String, String> {
    let probe = vec![ChatMessage {
        role: "user".into(),
        content: "Reply with the single word: ready".into(),
    }];
    let reply = chat_with_budget(cfg, &probe, 16).await?;
    Ok(clip(&reply, 80))
}

/// Extract a JSON array from a model reply, tolerating ```json fences.
pub fn parse_json_array(raw: &str) -> Result<serde_json::Value, String> {
    let trimmed = raw.trim();
    let body = if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after.strip_prefix("json").unwrap_or(after);
        after.split("```").next().unwrap_or(after).trim()
    } else {
        trimmed
    };
    let body = match (body.find('['), body.rfind(']')) {
        (Some(a), Some(b)) if b > a => &body[a..=b],
        _ => body,
    };
    serde_json::from_str::<serde_json::Value>(body)
        .map_err(|e| format!("Model did not return valid JSON: {e}"))
}

fn clip(s: &str, max: usize) -> String {
    let flat = s.replace(['\n', '\r'], " ");
    if flat.chars().count() <= max {
        flat
    } else {
        let cut: String = flat.chars().take(max).collect();
        format!("{cut}…")
    }
}

/// A compact, factual digest of the learner's progress. Injected into every
/// companion prompt so the model can answer "how am I doing?" without the
/// frontend having to ship the whole database over the wire.
pub async fn progress_context(db: &Db) -> String {
    let today = crate::db::today_key();

    let planned_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE planned_date = ?",
    )
    .bind(&today)
    .fetch_one(&db.pool)
    .await
    .unwrap_or(0);

    let done_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE planned_date = ? AND status = 'completed'",
    )
    .bind(&today)
    .fetch_one(&db.pool)
    .await
    .unwrap_or(0);

    let overdue: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE status = 'pending' AND planned_date < ?",
    )
    .bind(&today)
    .fetch_one(&db.pool)
    .await
    .unwrap_or(0);

    let streak = crate::commands::stats::compute_streaks(db)
        .await
        .map(|s| (s.current_streak, s.best_streak, s.qualifying_days_total))
        .unwrap_or((0, 0, 0));

    let heat = crate::commands::stats::heatmap(db, 30).await.ok();
    let (week, month) = match heat {
        Some(h) => {
            let last7: i64 = h.days.iter().rev().take(7).map(|d| d.completed).sum();
            let last30: i64 = h.days.iter().map(|d| d.completed).sum();
            (last7, last30)
        }
        None => (0, 0),
    };

    let notes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes")
        .fetch_one(&db.pool)
        .await
        .unwrap_or(0);
    let quizzes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quizzes")
        .fetch_one(&db.pool)
        .await
        .unwrap_or(0);
    let cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards")
        .fetch_one(&db.pool)
        .await
        .unwrap_or(0);

    let mut out = format!(
        "Today ({today}): {done_today}/{planned_today} tasks done, {overdue} pending past tasks.\n\
         Streak: {} days current, {} best, {} qualifying days total.\n\
         Completions: {week} in the last 7 days, {month} in the last 30.\n\
         Artifacts saved: {notes} notes, {quizzes} quizzes, {cards} flashcards.\n\
         Playlists:",
        streak.0, streak.1, streak.2
    );

    match db.load_playlists().await {
        Ok(list) if !list.is_empty() => {
            for p in list.iter().take(8) {
                let left = (p.item_count - p.completed_count).max(0);
                out.push_str(&format!(
                    "\n- \"{}\" ({:?}, {} day{}, {} of {} done, {} left, ordering {:?})",
                    p.title,
                    p.task_type,
                    p.daily_target,
                    if p.daily_target == 1 { "" } else { "s" },
                    p.completed_count,
                    p.item_count,
                    left,
                    p.ordering_policy
                ));
            }
        }
        Ok(_) => out.push_str("\n- none yet"),
        Err(_) => out.push_str("\n- unavailable"),
    }

    out
}

/// Context blob handed to prompts so answers are grounded in the user's data.
///
/// For YouTube lessons we also read the public watch page: its description
/// usually carries the chapter list, which is the closest thing to a syllabus
/// an anonymous request can get. Failure is silent — a missing description
/// must never block a question.
pub async fn item_context(db: &Db, item_id: &str) -> Result<String, String> {
    let row = sqlx::query(
        "SELECT i.title, i.url, p.title, p.task_type
         FROM items i JOIN playlists p ON p.id = i.playlist_id WHERE i.id = ?",
    )
    .bind(item_id)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Err("That lesson no longer exists.".into());
    };
    let title: String = row.try_get(0).map_err(|e| e.to_string())?;
    let url: Option<String> = row.try_get(1).ok().flatten();
    let playlist: String = row.try_get(2).map_err(|e| e.to_string())?;
    let kind: String = row.try_get(3).unwrap_or_else(|_| "\"mixed\"".into());

    let mut out = format!(
        "Lesson: {title}\nPlaylist: {playlist}\nFormat: {kind}\nURL: {}",
        url.clone().unwrap_or_else(|| "—".into())
    );

    // Lesson grounding: public description + chapters, and a transcript when
    // YouTube will release one to this client. Parsed once and cached in
    // SQLite, so asking five questions costs one fetch.
    if let Some(watch_url) = url.as_deref() {
        let cached: Option<String> =
            sqlx::query_scalar("SELECT body FROM item_context_cache_v2 WHERE item_id = ?")
                .bind(item_id)
                .fetch_optional(&db.pool)
                .await
                .ok()
                .flatten();

        let grounding = match cached.filter(|c| !c.trim().is_empty()) {
            Some(c) => Some(c),
            None => match fetch_video_context(watch_url).await {
                Some(body) => {
                    let _ = sqlx::query(
                        "INSERT INTO item_context_cache_v2 (item_id, body, fetched_at)
                         VALUES (?, ?, ?)
                         ON CONFLICT(item_id) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at",
                    )
                    .bind(item_id)
                    .bind(&body)
                    .bind(crate::models::now_iso())
                    .execute(&db.pool)
                    .await;
                    Some(body)
                }
                None => None,
            },
        };

        if let Some(body) = grounding {
            out.push_str("\n\nVideo material (use it; do not invent beyond it):\n");
            out.push_str(&body);
        }
    }

    Ok(out)
}

/// Best source first: `yt-dlp` knows YouTube's rotating client handshakes and
/// gives us the full description plus a caption track, so a doubt can be
/// answered from the lesson's actual words. If the tool is missing, or the
/// video has no captions, we fall back to the public watch page.
async fn fetch_video_context(url: &str) -> Option<String> {
    let (description, transcript) = match ytdlp_context(url).await {
        Some(pair) => pair,
        None => page_context(url).await.unwrap_or((None, None)),
    };

    if description.is_none() && transcript.is_none() {
        return None;
    }

    let mut out = String::new();
    if let Some(d) = &description {
        out.push_str("Description / chapters:\n");
        out.push_str(&clip_chars(d.trim(), 2600));
        out.push('\n');
    }
    if let Some(t) = &transcript {
        // Long lectures run past 30k characters; most of a lesson still fits
        // comfortably in a modern context window, so keep as much as is
        // useful rather than a summary of the opening minutes.
        out.push_str("\nTranscript (auto-generated captions; may contain errors):\n");
        out.push_str(&clip_chars(t, 26_000));
    }
    Some(out)
}

/// Shell out to `yt-dlp` for metadata and captions. Bounded by a hard timeout
/// so a slow network never stalls the companion's reply.
async fn ytdlp_context(url: &str) -> Option<(Option<String>, Option<String>)> {
    use tokio::process::Command;

    let fetch = Command::new("yt-dlp")
        .args([
            "--no-warnings",
            "--no-playlist",
            "--skip-download",
            "--dump-single-json",
            url,
        ])
        .kill_on_drop(true)
        .output();

    let output = tokio::time::timeout(Duration::from_secs(40), fetch)
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let description = value
        .get("description")
        .and_then(|d| d.as_str())
        .map(|d| d.trim().to_string())
        .filter(|d| d.len() >= 40);

    let caption_url = caption_track_url(&value);
    let transcript = match caption_url {
        Some((track_url, is_json)) => fetch_captions(&track_url, is_json).await,
        None => None,
    };

    if description.is_none() && transcript.is_none() {
        None
    } else {
        Some((description, transcript))
    }
}

/// Prefer an English track: hand-written first, then auto-generated; inside
/// each, the compact `json3` shape before `vtt`.
fn caption_track_url(value: &serde_json::Value) -> Option<(String, bool)> {
    let mut candidates: Vec<&serde_json::Value> = Vec::new();
    for bucket in ["subtitles", "automatic_captions"] {
        let Some(map) = value.get(bucket).and_then(|m| m.as_object()) else {
            continue;
        };
        for (lang, tracks) in map {
            if !(lang == "en" || lang.starts_with("en-")) {
                continue;
            }
            if let Some(list) = tracks.as_array() {
                candidates.extend(list.iter());
            }
        }
    }

    let pick = |ext: &str| {
        candidates
            .iter()
            .find(|t| t.get("ext").and_then(|e| e.as_str()) == Some(ext))
            .and_then(|t| t.get("url").and_then(|u| u.as_str()))
            .map(|u| u.to_string())
    };

    pick("json3")
        .map(|u| (u, true))
        .or_else(|| pick("vtt").map(|u| (u, false)))
}

async fn fetch_captions(url: &str, is_json: bool) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36")
        .build()
        .ok()?;
    let body = client.get(url).send().await.ok()?.text().await.ok()?;
    let text = if is_json {
        parse_json3(&body)
    } else {
        parse_vtt(&body)
    };
    if text.trim().len() < 40 { None } else { Some(text) }
}

fn parse_json3(body: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return String::new();
    };
    let mut out = String::new();
    if let Some(events) = value.get("events").and_then(|e| e.as_array()) {
        for event in events {
            if let Some(segs) = event.get("segs").and_then(|s| s.as_array()) {
                for seg in segs {
                    if let Some(t) = seg.get("utf8").and_then(|u| u.as_str()) {
                        out.push_str(t);
                    }
                }
            }
            out.push(' ');
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_vtt(vtt: &str) -> String {
    let mut out = String::new();
    for line in vtt.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed == "WEBVTT"
            || trimmed.starts_with("NOTE")
            || trimmed.starts_with("Kind:")
            || trimmed.starts_with("Language:")
            || trimmed.contains("-->")
        {
            continue;
        }
        let cleaned = strip_tags(trimmed);
        if cleaned.is_empty() {
            continue;
        }
        // Auto-captions repeat the rolling line; keep it once.
        if out.trim_end().ends_with(cleaned.as_str()) {
            continue;
        }
        out.push_str(&cleaned);
        out.push(' ');
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_tags(line: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in line.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .trim()
        .to_string()
}

/// Fallback: one watch-page fetch for the description (and transcript when
/// YouTube happens to expose the endpoint to an anonymous client).
async fn page_context(url: &str) -> Option<(Option<String>, Option<String>)> {
    let id = youtube_id(url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .gzip(true)
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
        .build()
        .ok()?;
    let html = client
        .get(format!("https://www.youtube.com/watch?v={id}&hl=en"))
        .header("accept-language", "en-US,en;q=0.9")
        .header("cookie", "SOCS=CAI; CONSENT=YES+cb")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;

    let description = extract_json_string(&html, "\"shortDescription\":\"")
        .filter(|d| d.trim().len() >= 40);
    let transcript = fetch_transcript(&client, &html).await;

    if description.is_none() && transcript.is_none() {
        None
    } else {
        Some((description, transcript))
    }
}

async fn fetch_transcript(client: &reqwest::Client, watch_html: &str) -> Option<String> {
    let params = extract_json_string(watch_html, "\"getTranscriptEndpoint\":{\"params\":\"")?;
    let body = serde_json::json!({
        "context": { "client": {
            "clientName": "WEB",
            "clientVersion": "2.20240726.00.00",
            "hl": "en",
            "gl": "US"
        }},
        "params": params
    });

    let endpoint = format!(
        "https://www.youtube.com/youtubei/v1/get_transcript?key={YOUTUBE_WEB_KEY}&prettyPrint=false"
    );
    let response = client
        .post(&endpoint)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let value: serde_json::Value = response.json().await.ok()?;

    let mut segments: Vec<String> = Vec::new();
    collect_transcript_segments(&value, &mut segments);
    if segments.is_empty() {
        return None;
    }
    let text = segments.join(" ");
    if text.trim().len() < 40 { None } else { Some(text) }
}

fn collect_transcript_segments(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(renderer) = map.get("transcriptSegmentRenderer") {
                let snippet = &renderer["snippet"];
                let text = if let Some(runs) = snippet.get("runs").and_then(|r| r.as_array()) {
                    runs.iter()
                        .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                        .collect::<String>()
                } else {
                    snippet
                        .get("simpleText")
                        .and_then(|t| t.as_str())
                        .unwrap_or_default()
                        .to_string()
                };
                if !text.trim().is_empty() {
                    out.push(text);
                }
            }
            for child in map.values() {
                collect_transcript_segments(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_transcript_segments(child, out);
            }
        }
        _ => {}
    }
}

/// Read a JSON string value that starts right after `marker` and is escaped
/// inside the page's data blob.
fn extract_json_string(html: &str, marker: &str) -> Option<String> {
    let at = html.find(marker)? + marker.len();
    let rest = &html[at..];
    let mut escaped = false;
    let mut end = rest.len();
    for (i, c) in rest.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' => escaped = true,
            '"' => {
                end = i;
                break;
            }
            _ => {}
        }
    }
    let raw = &rest[..end];
    let decoded: String = serde_json::from_str(&format!("\"{raw}\""))
        .unwrap_or_else(|_| raw.replace("\\n", "\n"));
    Some(decoded)
}

fn youtube_id(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let host = parsed.host_str().unwrap_or_default();
    if host.contains("youtu.be") {
        return parsed.path_segments()?.next().filter(|s| !s.is_empty()).map(String::from);
    }
    if !host.contains("youtube") {
        return None;
    }
    if let Some((_, v)) = parsed.query_pairs().find(|(k, _)| k == "v") {
        return Some(v.to_string());
    }
    let parts: Vec<&str> = parsed.path().trim_matches('/').split('/').collect();
    let idx = parts.iter().position(|p| *p == "embed" || *p == "shorts")?;
    parts.get(idx + 1).map(|s| s.to_string())
}

pub fn clip_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}…")
    }
}

#[cfg(test)]
mod context_tests {
    /// Network test, run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "hits youtube.com and needs yt-dlp"]
    async fn gathers_description_and_captions() {
        let ctx = super::fetch_video_context("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            .await
            .expect("video context");
        eprintln!("context chars={} ", ctx.chars().count());
        assert!(ctx.contains("Description"), "no description section");
        assert!(ctx.contains("Transcript"), "no transcript section");
        assert!(ctx.chars().count() > 800, "context too thin");
    }
}
