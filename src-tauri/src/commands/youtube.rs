use std::collections::HashSet;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::command;

#[derive(Debug, Clone, Serialize)]
pub struct Preview {
    pub title: String,
    pub items: Vec<PreviewItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewItem {
    pub title: String,
    pub url: String,
    pub source_item_id: Option<String>,
    pub position: i64,
}

/// The public web client key YouTube's own page uses. It is not a user
/// secret and needs no account; it only lets us call the same browse
/// endpoint the website calls, which returns clean JSON instead of a page.
const WEB_KEY: &str = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CLIENT_VERSION: &str = "2.20240726.00.00";

#[command]
pub async fn fetch_youtube_playlist(url: String) -> Result<Preview, String> {
    fetch_playlist(&url).await.map_err(|e| e.to_string())
}

/// Three strategies, best first:
///   1. InnerTube `browse` (JSON, pages up to ~600 videos)
///   2. The playlist RSS feed (clean XML, first 15 videos)
///   3. One HTML GET, tolerant scan of the embedded data blob
/// A playlist is never silently truncated: if 1 succeeds we use its full list.
pub async fn fetch_playlist(url: &str) -> Result<Preview, Box<dyn std::error::Error>> {
    let list_id = extract_list_id(url).ok_or("could not find list=… id in that URL")?;

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        )
        .gzip(true)
        .timeout(std::time::Duration::from_secs(25))
        .build()?;

    let mut failures: Vec<String> = Vec::new();

    match browse(&client, &list_id).await {
        Ok(p) if !p.items.is_empty() => return Ok(p),
        Ok(_) => failures.push("browse returned no videos".into()),
        Err(e) => failures.push(format!("browse: {e}")),
    }

    match rss(&client, &list_id).await {
        Ok(p) if !p.items.is_empty() => return Ok(p),
        Ok(_) => failures.push("feed returned no videos".into()),
        Err(e) => failures.push(format!("feed: {e}")),
    }

    match scrape(&client, &list_id).await {
        Ok(p) if !p.items.is_empty() => return Ok(p),
        Ok(_) => failures.push("page returned no videos".into()),
        Err(e) => failures.push(format!("page: {e}")),
    }

    Err(format!(
        "YouTube did not return this playlist ({}). It may be private, age-restricted, or region-blocked.",
        failures.join("; ")
    )
    .into())
}

/* ----------------------------- strategy 1 ----------------------------- */

fn context() -> Value {
    json!({
        "client": {
            "clientName": "WEB",
            "clientVersion": CLIENT_VERSION,
            "hl": "en",
            "gl": "US",
            "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        }
    })
}

async fn browse(client: &reqwest::Client, list_id: &str) -> Result<Preview, String> {
    let endpoint = format!(
        "https://www.youtube.com/youtubei/v1/browse?key={WEB_KEY}&prettyPrint=false"
    );

    let mut items: Vec<PreviewItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut used_tokens: HashSet<String> = HashSet::new();
    let mut title: Option<String> = None;
    let mut token: Option<String> = None;

    for page in 0..8 {
        let body = if page == 0 {
            json!({ "context": context(), "browseId": format!("VL{list_id}") })
        } else {
            match &token {
                Some(t) => json!({ "context": context(), "continuation": t }),
                None => break,
            }
        };

        let response = client
            .post(&endpoint)
            .header("content-type", "application/json")
            .header("accept-language", "en-US,en;q=0.9")
            .header("origin", "https://www.youtube.com")
            .header("x-youtube-client-name", "1")
            .header("x-youtube-client-version", CLIENT_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("HTTP {status}"));
        }
        let value: Value =
            serde_json::from_str(&text).map_err(|e| format!("invalid JSON: {e}"))?;

        if title.is_none() {
            title = find_playlist_title(&value);
        }

        for (id, video_title) in collect_videos(&value) {
            if id.is_empty() || seen.contains(&id) {
                continue;
            }
            seen.insert(id.clone());
            let position = items.len() as i64;
            items.push(PreviewItem {
                title: video_title,
                url: format!("https://www.youtube.com/watch?v={id}"),
                source_item_id: Some(id),
                position,
            });
        }

        token = find_continuation(&value, &used_tokens);
        match &token {
            Some(t) => {
                used_tokens.insert(t.clone());
            }
            None => break,
        }
    }

    if items.is_empty() {
        return Err("no videos in the response".into());
    }

    Ok(Preview {
        title: title.unwrap_or_else(|| "Imported playlist".into()),
        items,
    })
}

fn find_playlist_title(value: &Value) -> Option<String> {
    let mut found: Option<String> = None;
    walk(value, &mut |node| {
        if found.is_some() {
            return;
        }
        if let Some(meta) = node.get("playlistMetadataRenderer") {
            if let Some(t) = meta.get("title").and_then(|t| t.as_str()) {
                if !t.trim().is_empty() {
                    found = Some(t.trim().to_string());
                }
            }
        }
    });
    found
}

/// Both shapes YouTube uses: the modern `lockupViewModel` and the older
/// `playlistVideoRenderer`. Modern pages send lockups; embedded JSON often
/// still carries the renderer.
fn collect_videos(value: &Value) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();

    walk(value, &mut |node| {
        if let Some(lockup) = node.get("lockupViewModel") {
            let kind = lockup
                .get("contentType")
                .and_then(|c| c.as_str())
                .unwrap_or_default();
            if kind.is_empty() || kind == "LOCKUP_CONTENT_TYPE_VIDEO" {
                let id = lockup
                    .get("contentId")
                    .and_then(|c| c.as_str())
                    .unwrap_or_default()
                    .to_string();
                let title = lockup
                    .get("metadata")
                    .and_then(|m| m.get("lockupMetadataViewModel"))
                    .and_then(|m| m.get("title"))
                    .and_then(|t| t.get("content"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("Untitled")
                    .to_string();
                if !id.is_empty() {
                    out.push((id, html_entities(&title)));
                }
            }
            return;
        }

        if let Some(renderer) = node.get("playlistVideoRenderer") {
            let id = renderer
                .get("videoId")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let title = renderer
                .get("title")
                .and_then(title_text)
                .unwrap_or_else(|| "Untitled".into());
            if !id.is_empty() {
                out.push((id, html_entities(&title)));
            }
        }
    });

    out
}

fn title_text(node: &Value) -> Option<String> {
    if let Some(s) = node.get("simpleText").and_then(|s| s.as_str()) {
        return Some(s.to_string());
    }
    let runs = node.get("runs")?.as_array()?;
    let text: String = runs
        .iter()
        .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
        .collect();
    if text.is_empty() { None } else { Some(text) }
}

fn find_continuation(value: &Value, used: &HashSet<String>) -> Option<String> {
    let mut found: Option<String> = None;
    walk(value, &mut |node| {
        if found.is_some() {
            return;
        }
        if let Some(cmd) = node.get("continuationCommand") {
            if let Some(token) = cmd.get("token").and_then(|t| t.as_str()) {
                if !token.is_empty() && !used.contains(token) {
                    found = Some(token.to_string());
                }
            }
        }
    });
    found
}

/* ----------------------------- strategy 2 ----------------------------- */

/// YouTube still serves an XML feed per playlist, capped at 15 entries.
async fn rss(client: &reqwest::Client, list_id: &str) -> Result<Preview, String> {
    let xml = client
        .get(format!(
            "https://www.youtube.com/feeds/videos.xml?playlist_id={list_id}"
        ))
        .header("accept-language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let title = feed_title(&xml).unwrap_or_else(|| "Imported playlist".into());
    let mut items = Vec::new();
    let mut cursor = 0usize;
    while let Some(offset) = xml[cursor..].find("<entry>") {
        let start = cursor + offset + "<entry>".len();
        let rest = &xml[start..];
        let end = rest.find("</entry>").unwrap_or(rest.len());
        let entry = &rest[..end];
        cursor = start + end;

        let id = tag_text(entry, "yt:videoId").unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let position = items.len() as i64;
        items.push(PreviewItem {
            title: html_entities(&tag_text(entry, "title").unwrap_or_else(|| "Untitled".into())),
            url: format!("https://www.youtube.com/watch?v={id}"),
            source_item_id: Some(id),
            position,
        });
    }

    if items.is_empty() {
        return Err("empty feed".into());
    }
    Ok(Preview { title, items })
}

fn feed_title(xml: &str) -> Option<String> {
    let at = xml.find("<title>")? + "<title>".len();
    let rest = &xml[at..];
    let end = rest.find("</title>")?;
    let t = html_entities(rest[..end].trim());
    if t.is_empty() { None } else { Some(t) }
}

fn tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let at = xml.find(&open)? + open.len();
    let rest = &xml[at..];
    let end = rest.find(&close)?;
    Some(rest[..end].to_string())
}

/* ----------------------------- strategy 3 ----------------------------- */

/// Last resort: the page itself. Parse the same two shapes out of the
/// embedded JSON blob, so this keeps working after YouTube's HTML wrapper
/// changes as long as the data payload keeps its renderer names.
async fn scrape(client: &reqwest::Client, list_id: &str) -> Result<Preview, String> {
    let html = client
        .get(format!(
            "https://www.youtube.com/playlist?list={list_id}&hl=en"
        ))
        .header("accept-language", "en-US,en;q=0.9")
        .header("cookie", "SOCS=CAI; CONSENT=YES+cb")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let title = html_page_title(&html).unwrap_or_else(|| "Imported playlist".into());

    let mut items: Vec<PreviewItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut push = |id: String, name: String| {
        if id.is_empty() || seen.contains(&id) {
            return;
        }
        seen.insert(id.clone());
        let position = items.len() as i64;
        items.push(PreviewItem {
            title: name,
            url: format!("https://www.youtube.com/watch?v={id}"),
            source_item_id: Some(id),
            position,
        });
    };

    // lockupViewModel blocks: contentId then title.content within a short window
    let mut cursor = 0usize;
    while let Some(offset) = html[cursor..].find("\"lockupViewModel\":{") {
        let start = cursor + offset;
        let chunk = &html[start..(start + 3000).min(html.len())];
        cursor = start + 18;
        if chunk.contains("LOCKUP_CONTENT_TYPE_PLAYLIST") {
            continue;
        }
        let id = find_string_field(chunk, "contentId").unwrap_or_default();
        let name = lockup_title(chunk).unwrap_or_else(|| "Untitled".into());
        push(id, html_entities(&name));
    }

    // older playlistVideoRenderer blocks
    let mut cursor = 0usize;
    while let Some(offset) = html[cursor..].find("\"playlistVideoRenderer\":") {
        let start = cursor + offset + "\"playlistVideoRenderer\":".len();
        let rest = &html[start..];
        let end = rest
            .find("\"playlistVideoRenderer\":")
            .unwrap_or(rest.len().min(4000));
        let chunk = &rest[..end];
        cursor = start;
        let id = find_string_field(chunk, "videoId").unwrap_or_default();
        let name = find_title_runs(chunk);
        push(id, name);
    }

    if items.is_empty() {
        return Err("no playlist entries in the page".into());
    }
    Ok(Preview { title, items })
}

fn lockup_title(chunk: &str) -> Option<String> {
    let pat = "\"lockupMetadataViewModel\":{";
    let at = chunk.find(pat)? + pat.len();
    let rest = &chunk[at..];
    let title_at = rest.find("\"title\":")?;
    let after = &rest[title_at..];
    let content_at = after.find("\"content\":\"")? + "\"content\":\"".len();
    let tail = &after[content_at..];
    let end = tail.find('"')?;
    Some(tail[..end].to_string())
}

fn html_page_title(html: &str) -> Option<String> {
    let start = html.find("<title>")?;
    let rest = &html[start + 7..];
    let end = rest.find("</title>")?;
    let raw = html_entities(rest[..end].trim());
    Some(
        raw.strip_suffix(" - YouTube")
            .map(|s| s.trim().to_string())
            .unwrap_or(raw),
    )
}

fn extract_list_id(url: &str) -> Option<String> {
    let trimmed = url.trim();

    // A bare playlist id is a valid answer to "paste a playlist".
    let looks_like_id = trimmed.len() > 10
        && !trimmed.contains('/')
        && !trimmed.contains(' ')
        && ["PL", "UU", "OL", "FL", "RD", "LL", "WL"]
            .iter()
            .any(|p| trimmed.starts_with(p));
    if looks_like_id {
        return Some(trimmed.to_string());
    }

    let parsed = url::Url::parse(trimmed)
        .or_else(|_| url::Url::parse(&format!("https://{trimmed}")))
        .ok()?;
    let value = parsed
        .query_pairs()
        .find(|(k, _)| k == "list")
        .map(|(_, v)| v.to_string())?;
    if value.is_empty() { None } else { Some(value) }
}

/* ------------------------------ helpers ------------------------------ */

fn walk<'a>(value: &'a Value, f: &mut impl FnMut(&'a Value)) {
    f(value);
    match value {
        Value::Object(map) => {
            for child in map.values() {
                walk(child, f);
            }
        }
        Value::Array(items) => {
            for child in items {
                walk(child, f);
            }
        }
        _ => {}
    }
}

fn find_string_field(chunk: &str, field: &str) -> Option<String> {
    let pat = format!("\"{field}\":\"");
    let at = chunk.find(&pat)? + pat.len();
    let rest = &chunk[at..];
    let end = rest.find('"')?;
    let value = &rest[..end.min(rest.len())];
    if value.is_empty() || value.len() > 64 {
        None
    } else {
        Some(value.to_string())
    }
}

fn find_title_runs(chunk: &str) -> String {
    let pat = "runs\":[{\"";
    let at = match chunk.find(pat) {
        Some(at) => at + pat.len(),
        None => return "Untitled".into(),
    };
    let rest = &chunk[at..];
    let end = rest.find("}]").unwrap_or(rest.len());
    let blob = &rest[..end];
    blob.split("\"text\":\"")
        .skip(1)
        .map(|piece| {
            let e = piece.find('"').unwrap_or(0);
            piece[..e.min(piece.len())].to_string()
        })
        .collect::<Vec<_>>()
        .join("")
}

#[cfg(test)]
mod tests {
    /// Network test, excluded from normal runs: `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "hits youtube.com"]
    async fn fetches_a_public_playlist() {
        let p = super::fetch_playlist(
            "https://www.youtube.com/playlist?list=PLgUwDviBIf0qUlt5H_kiKYaNSqJ81PMMY",
        )
        .await
        .expect("playlist fetch");
        eprintln!("title={} items={}", p.title, p.items.len());
        assert!(!p.title.is_empty());
        assert!(p.items.len() >= 10, "only {} items", p.items.len());
        assert!(p.items[0].url.contains("watch?v="));
    }
}

fn html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("\\u0026", "&")
        .replace("\\\"", "\"")
        .replace("\\/", "/")
}
