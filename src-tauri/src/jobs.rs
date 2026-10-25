//! Persistent job queue for background AI work.
//!
//! A job survives restarts because it lives in SQLite. The worker never
//! holds the database lock across an HTTP call: it reads what it needs,
//! releases, calls the gateway, then re-locks to store the result. That
//! keeps the UI responsive while a generation runs.

use std::sync::Arc;

use sqlx::Row;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::ai;
use crate::db::Db;
use crate::models::{now_iso, ChatMessage, Flashcard, Job, Quiz, QuizQuestion};

impl Db {
    pub async fn enqueue(&self, kind: &str, item_id: Option<&str>, playlist_id: Option<&str>) -> Result<Job, String> {
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        sqlx::query(
            "INSERT INTO jobs (id, kind, item_id, playlist_id, payload, status, attempts, created_at, updated_at)
             VALUES (?, ?, ?, ?, '{}', 'queued', 0, ?, ?)",
        )
        .bind(&id)
        .bind(kind)
        .bind(item_id)
        .bind(playlist_id)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        self.job(&id).await?.ok_or_else(|| "job vanished".to_string())
    }

    pub async fn job(&self, id: &str) -> Result<Option<Job>, String> {
        let row = sqlx::query(
            "SELECT id, kind, item_id, status, attempts, error, created_at, updated_at
             FROM jobs WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        let Some(r) = row else { return Ok(None) };
        Ok(Some(Job {
            id: r.try_get(0).map_err(|e| e.to_string())?,
            kind: r.try_get(1).map_err(|e| e.to_string())?,
            item_id: r.try_get(2).ok().flatten(),
            status: r.try_get(3).map_err(|e| e.to_string())?,
            attempts: r.try_get(4).map_err(|e| e.to_string())?,
            error: r.try_get(5).ok().flatten(),
            created_at: r.try_get(6).map_err(|e| e.to_string())?,
            updated_at: r.try_get(7).map_err(|e| e.to_string())?,
        }))
    }

    pub async fn list_jobs(&self, limit: i64) -> Result<Vec<Job>, String> {
        let rows = sqlx::query(
            "SELECT id, kind, item_id, status, attempts, error, created_at, updated_at
             FROM jobs ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|r| {
                Ok(Job {
                    id: r.try_get(0).map_err(|e| e.to_string())?,
                    kind: r.try_get(1).map_err(|e| e.to_string())?,
                    item_id: r.try_get(2).ok().flatten(),
                    status: r.try_get(3).map_err(|e| e.to_string())?,
                    attempts: r.try_get(4).map_err(|e| e.to_string())?,
                    error: r.try_get(5).ok().flatten(),
                    created_at: r.try_get(6).map_err(|e| e.to_string())?,
                    updated_at: r.try_get(7).map_err(|e| e.to_string())?,
                })
            })
            .collect()
    }

    pub async fn retry_job(&self, id: &str) -> Result<(), String> {
        sqlx::query("UPDATE jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ?")
            .bind(now_iso())
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /* ------------------------- artifacts ------------------------- */

    pub async fn list_quizzes(&self) -> Result<Vec<Quiz>, String> {
        let rows = sqlx::query(
            "SELECT q.id, q.item_id, q.playlist_id, q.title, q.questions, q.created_at,
                    (SELECT MAX(score) FROM quiz_attempts a WHERE a.quiz_id = q.id)
             FROM quizzes q ORDER BY q.created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .filter_map(|r| {
                let raw: String = r.try_get(4).ok()?;
                let questions: Vec<QuizQuestion> = serde_json::from_str(&raw).ok()?;
                Some(Quiz {
                    id: r.try_get(0).ok()?,
                    item_id: r.try_get(1).ok().flatten(),
                    playlist_id: r.try_get(2).ok().flatten(),
                    title: r.try_get(3).ok()?,
                    created_at: r.try_get(5).ok()?,
                    best_score: r.try_get(6).ok().flatten(),
                    total: questions.len() as i64,
                    questions,
                })
            })
            .collect())
    }

    pub async fn submit_quiz(&self, quiz_id: &str, answers: Vec<i64>) -> Result<i64, String> {
        let raw: Option<String> =
            sqlx::query_scalar("SELECT questions FROM quizzes WHERE id = ?")
                .bind(quiz_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        let questions: Vec<QuizQuestion> =
            serde_json::from_str(&raw.ok_or("Quiz not found.")? ).map_err(|e| e.to_string())?;

        let score = questions
            .iter()
            .enumerate()
            .filter(|(i, q)| answers.get(*i) == Some(&q.answer))
            .count() as i64;

        sqlx::query(
            "INSERT INTO quiz_attempts (id, quiz_id, answers, score, total, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(quiz_id)
        .bind(serde_json::to_string(&answers).unwrap_or_else(|_| "[]".into()))
        .bind(score)
        .bind(questions.len() as i64)
        .bind(now_iso())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(score)
    }

    pub async fn list_flashcards(&self) -> Result<Vec<Flashcard>, String> {
        let rows = sqlx::query(
            "SELECT f.id, f.item_id, f.deck, f.front, f.back, f.created_at,
                    (SELECT COUNT(*) FROM flashcard_reviews r WHERE r.card_id = f.id),
                    (SELECT MAX(reviewed_at) FROM flashcard_reviews r WHERE r.card_id = f.id)
             FROM flashcards f ORDER BY f.deck, f.created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows
            .into_iter()
            .filter_map(|r| {
                Some(Flashcard {
                    id: r.try_get(0).ok()?,
                    item_id: r.try_get(1).ok().flatten(),
                    deck: r.try_get(2).ok()?,
                    front: r.try_get(3).ok()?,
                    back: r.try_get(4).ok()?,
                    created_at: r.try_get(5).ok()?,
                    reviews: r.try_get(6).ok()?,
                    last_reviewed: r.try_get(7).ok().flatten(),
                })
            })
            .collect())
    }

    pub async fn review_flashcard(&self, card_id: &str, rating: &str) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO flashcard_reviews (id, card_id, rating, reviewed_at) VALUES (?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(card_id)
        .bind(rating)
        .bind(now_iso())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/* ----------------------------- worker ----------------------------- */

/// Process one queued job. Returns true when a job was picked up.
pub async fn worker_tick(db: &Arc<Mutex<Db>>) -> Result<bool, String> {
    // 1. Claim work (short lock).
    let claimed = {
        let guard = db.lock().await;
        sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
            "SELECT id, kind, item_id, playlist_id FROM jobs
             WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1",
        )
        .fetch_optional(&guard.pool)
        .await
        .map_err(|e| e.to_string())?
    };

    let Some((job_id, kind, item_id, playlist_id)) = claimed else {
        return Ok(false);
    };

    let cfg = {
        let guard = db.lock().await;
        sqlx::query("UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?")
            .bind(now_iso())
            .bind(&job_id)
            .execute(&guard.pool)
            .await
            .map_err(|e| e.to_string())?;
        guard.ai_config().await
    };

    // 2. Do the network work with no lock held.
    let outcome = run_kind(db, &cfg, &kind, item_id.as_deref(), playlist_id.as_deref()).await;

    // 3. Record the result.
    let guard = db.lock().await;
    match outcome {
        Ok(()) => {
            sqlx::query("UPDATE jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?")
                .bind(now_iso())
                .bind(&job_id)
                .execute(&guard.pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            sqlx::query("UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
                .bind(&e)
                .bind(now_iso())
                .bind(&job_id)
                .execute(&guard.pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(true)
}

pub async fn run_kind(
    db: &Arc<Mutex<Db>>,
    cfg: &crate::models::AiConfig,
    kind: &str,
    item_id: Option<&str>,
    playlist_id: Option<&str>,
) -> Result<(), String> {
    match kind {
        "generate_note" => generate_note(db, cfg, item_id).await,
        "generate_quiz" => generate_quiz(db, cfg, item_id, playlist_id).await,
        "generate_flashcards" => generate_flashcards(db, cfg, item_id, playlist_id).await,
        other => Err(format!("Unknown job kind: {other}")),
    }
}

async fn generate_note(
    db: &Arc<Mutex<Db>>,
    cfg: &crate::models::AiConfig,
    item_id: Option<&str>,
) -> Result<(), String> {
    let item_id = item_id.ok_or("This job has no lesson attached.")?;
    let context = {
        let guard = db.lock().await;
        ai::item_context(&guard, item_id).await?
    };

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "You write dense, practical study notes in Markdown for a developer. \
                      Use ## headings, short paragraphs, bullet points, fenced code blocks with \
                      a language tag, and at least one worked example. Include exactly one \
                      ```mermaid flowchart (or sequenceDiagram when order matters) that shows how \
                      the ideas connect — keep node labels short and quote labels with spaces. \
                      Use a table when comparing options. No preamble, no sign-off. When a video \
                      transcript is supplied below, treat it as the source of truth: cover what the \
                      instructor actually teaches, in their order, with their examples. When it is \
                      absent, teach the topic named in the lesson title."
                .into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!(
                "Write notes for this lesson.\n\n{context}\n\nStart with a one-line summary, \
                 then a '## How it fits together' Mermaid diagram, then the key ideas, then a \
                 worked example, then two pitfalls, then 3 revision questions with answers under \
                 a '## Check yourself' heading."
            ),
        },
    ];

    let body = ai::chat_for_generation(cfg, &messages, 4000).await?;
    let title = {
        let guard = db.lock().await;
        let t: Option<String> = sqlx::query_scalar("SELECT title FROM items WHERE id = ?")
            .bind(item_id)
            .fetch_optional(&guard.pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
        t.unwrap_or_else(|| "Lesson notes".into())
    };

    let guard = db.lock().await;
    guard
        .save_note(item_id, None, &title, &body, "ai")
        .await
        .map(|_| ())
}

async fn generate_quiz(
    db: &Arc<Mutex<Db>>,
    cfg: &crate::models::AiConfig,
    item_id: Option<&str>,
    playlist_id: Option<&str>,
) -> Result<(), String> {
    let item_id = item_id.ok_or("This job has no lesson attached.")?;
    let (context, note_body) = {
        let guard = db.lock().await;
        let ctx = ai::item_context(&guard, item_id).await?;
        let note = guard.note_for_item(item_id).await?;
        (ctx, note.map(|n| n.body).unwrap_or_default())
    };

    let compact = ai::clip_chars(&context, 8_000);
    let notes = if note_body.is_empty() {
        "(none yet)".to_string()
    } else {
        ai::clip_chars(&note_body, 2_000)
    };

    let mut questions: Vec<QuizQuestion> = Vec::new();
    let mut last_error = String::new();
    let mut parsed = serde_json::Value::Null;
    for (count, tokens, secs) in [(5u32, 2600u32, 150u64), (3, 1600, 120)] {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "You write exam-quality multiple-choice questions. Reply with ONLY a \
                          JSON array. Each element: {\"prompt\": string, \"choices\": [4 \
                          strings], \"answer\": index of the correct choice, \"why\": \
                          one-sentence explanation}."
                    .into(),
            },
            ChatMessage {
                role: "user".into(),
                content: format!(
                    "Write {count} questions.\n\n{compact}\n\nNotes the learner wrote:\n{notes}\n\n\
                     Test understanding, not trivia."
                ),
            },
        ];

        match ai::chat_with_timeout(cfg, &messages, tokens, secs).await {
            Ok(raw) => match ai::parse_json_array(&raw) {
                Ok(value) => {
                    parsed = value;
                    break;
                }
                Err(e) => last_error = e,
            },
            Err(e) => last_error = e,
        }
    }
    if parsed.is_null() {
        return Err(format!(
            "The quiz could not be generated ({last_error}). Check the gateway in Settings → AI, then retry."
        ));
    }

    for q in parsed.as_array().cloned().unwrap_or_default() {
        let prompt = q["prompt"].as_str().unwrap_or_default().trim().to_string();
        let choices: Vec<String> = q["choices"]
            .as_array()
            .map(|a| a.iter().filter_map(|c| c.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let answer = q["answer"].as_i64().unwrap_or(0);
        let why = q["why"].as_str().unwrap_or_default().to_string();
        if !prompt.is_empty() && choices.len() >= 2 {
            questions.push(QuizQuestion {
                prompt,
                answer: answer.clamp(0, choices.len() as i64 - 1),
                choices,
                why,
            });
        }
    }
    if questions.is_empty() {
        return Err("The model returned no usable questions.".into());
    }

    let title = {
        let guard = db.lock().await;
        let t: Option<String> = sqlx::query_scalar("SELECT title FROM items WHERE id = ?")
            .bind(item_id)
            .fetch_optional(&guard.pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
        t.unwrap_or_else(|| "Quiz".into())
    };

    let guard = db.lock().await;
    sqlx::query(
        "INSERT INTO quizzes (id, item_id, playlist_id, title, questions, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(item_id)
    .bind(playlist_id)
    .bind(format!("{title} — quiz"))
    .bind(serde_json::to_string(&questions).map_err(|e| e.to_string())?)
    .bind(now_iso())
    .execute(&guard.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn generate_flashcards(
    db: &Arc<Mutex<Db>>,
    cfg: &crate::models::AiConfig,
    item_id: Option<&str>,
    playlist_id: Option<&str>,
) -> Result<(), String> {
    let item_id = item_id.ok_or("This job has no lesson attached.")?;
    let (context, note_body, deck) = {
        let guard = db.lock().await;
        let ctx = ai::item_context(&guard, item_id).await?;
        let note = guard.note_for_item(item_id).await?;
        let deck: Option<String> = sqlx::query_scalar(
            "SELECT p.title FROM items i JOIN playlists p ON p.id = i.playlist_id WHERE i.id = ?",
        )
        .bind(item_id)
        .fetch_optional(&guard.pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();
        (ctx, note.map(|n| n.body).unwrap_or_default(), deck.unwrap_or_else(|| "General".into()))
    };

    // Gateways that front cheap upstreams sometimes stall on a huge prompt or
    // answer a JSON request with prose. Cap the context, ask for a small deck,
    // and fall back to a leaner retry instead of failing the whole job.
    let compact = ai::clip_chars(&context, 6_000);
    let notes = if note_body.is_empty() {
        "(none)".to_string()
    } else {
        ai::clip_chars(&note_body, 2_000)
    };

    let mut cards: Vec<(String, String)> = Vec::new();
    let mut last_error = String::new();
    for (count, tokens, secs) in [(6u32, 1400u32, 150u64), (4, 900, 120)] {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: format!(
                    "You write spaced-repetition flashcards for a developer. Reply with ONLY a \
                     JSON array of at most {count} objects, each {{\"front\": question, \
                     \"back\": one-to-two-sentence answer}}. No prose and no code fences."
                ),
            },
            ChatMessage {
                role: "user".into(),
                content: format!(
                    "Lesson:\n{compact}\n\nLearner notes:\n{notes}\n\nWrite the {count} \
                     highest-value cards from this material."
                ),
            },
        ];

        match ai::chat_with_timeout(cfg, &messages, tokens, secs).await {
            Ok(raw) => match ai::parse_json_array(&raw) {
                Ok(parsed) => {
                    for c in parsed.as_array().cloned().unwrap_or_default() {
                        let front = c["front"].as_str().unwrap_or_default().trim().to_string();
                        let back = c["back"].as_str().unwrap_or_default().trim().to_string();
                        if !front.is_empty() && !back.is_empty() {
                            cards.push((front, back));
                        }
                    }
                    if !cards.is_empty() {
                        break;
                    }
                    last_error = "the model returned no usable cards".into();
                }
                Err(e) => last_error = e,
            },
            Err(e) => last_error = e,
        }
    }
    if cards.is_empty() {
        return Err(format!(
            "Cards could not be generated ({last_error}). Check the gateway in Settings → AI, then retry."
        ));
    }

    let guard = db.lock().await;
    for (front, back) in cards {
        sqlx::query(
            "INSERT INTO flashcards (id, item_id, playlist_id, deck, front, back, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(item_id)
        .bind(playlist_id)
        .bind(&deck)
        .bind(front)
        .bind(back)
        .bind(now_iso())
        .execute(&guard.pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
