//! Notes: one note per lesson, with append-only versions.
//! Every save (editor or AI regeneration) writes a new row into
//! note_versions, so a regeneration can never destroy an earlier draft.

use sqlx::Row;
use uuid::Uuid;

use crate::db::Db;
use crate::models::{now_iso, Note, NoteVersion};

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

impl Db {
    pub async fn list_notes(&self) -> Result<Vec<Note>, String> {
        let rows = sqlx::query(
            "SELECT n.id, n.item_id, n.playlist_id, COALESCE(i.title, n.title) AS item_title,
                    n.title, n.body, n.source, n.version, n.updated_at
             FROM notes n LEFT JOIN items i ON i.id = n.item_id
             ORDER BY n.updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|r| {
                Ok(Note {
                    id: r.try_get(0).map_err(|e| e.to_string())?,
                    item_id: r.try_get(1).map_err(|e| e.to_string())?,
                    playlist_id: r.try_get(2).ok().flatten(),
                    item_title: r.try_get(3).map_err(|e| e.to_string())?,
                    title: r.try_get(4).map_err(|e| e.to_string())?,
                    body: r.try_get(5).map_err(|e| e.to_string())?,
                    source: r.try_get(6).map_err(|e| e.to_string())?,
                    version: r.try_get::<i64, _>(7).map_err(|e| e.to_string())?,
                    updated_at: r.try_get(8).map_err(|e| e.to_string())?,
                })
            })
            .collect()
    }

    pub async fn note_for_item(&self, item_id: &str) -> Result<Option<Note>, String> {
        let row = sqlx::query(
            "SELECT n.id, n.item_id, n.playlist_id, COALESCE(i.title, n.title),
                    n.title, n.body, n.source, n.version, n.updated_at
             FROM notes n LEFT JOIN items i ON i.id = n.item_id
             WHERE n.item_id = ?",
        )
        .bind(item_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let Some(r) = row else { return Ok(None) };
        Ok(Some(Note {
            id: r.try_get(0).map_err(|e| e.to_string())?,
            item_id: r.try_get(1).map_err(|e| e.to_string())?,
            playlist_id: r.try_get(2).ok().flatten(),
            item_title: r.try_get(3).map_err(|e| e.to_string())?,
            title: r.try_get(4).map_err(|e| e.to_string())?,
            body: r.try_get(5).map_err(|e| e.to_string())?,
            source: r.try_get(6).map_err(|e| e.to_string())?,
            version: r.try_get::<i64, _>(7).map_err(|e| e.to_string())?,
            updated_at: r.try_get(8).map_err(|e| e.to_string())?,
        }))
    }

    /// Upsert the lesson note and append a version row for the new body.
    pub async fn save_note(
        &self,
        item_id: &str,
        playlist_id: Option<&str>,
        title: &str,
        body: &str,
        source: &str,
    ) -> Result<Note, String> {
        let existing = self.note_for_item(item_id).await?;
        let now = now_iso();

        let (id, version) = match &existing {
            Some(n) => {
                sqlx::query(
                    "UPDATE notes SET title = ?, body = ?, source = ?, version = ?, updated_at = ?
                     WHERE id = ?",
                )
                .bind(title)
                .bind(body)
                .bind(source)
                .bind(n.version + 1)
                .bind(&now)
                .bind(&n.id)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
                (n.id.clone(), n.version + 1)
            }
            None => {
                let id = new_id();
                sqlx::query(
                    "INSERT INTO notes (id, item_id, playlist_id, title, body, source, version, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
                )
                .bind(&id)
                .bind(item_id)
                .bind(playlist_id)
                .bind(title)
                .bind(body)
                .bind(source)
                .bind(&now)
                .bind(&now)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
                (id, 1)
            }
        };

        sqlx::query(
            "INSERT INTO note_versions (id, note_id, version, body, source, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(&id)
        .bind(version)
        .bind(body)
        .bind(source)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        self.note_for_item(item_id)
            .await?
            .ok_or_else(|| "Note vanished while saving.".to_string())
    }

    pub async fn note_versions(&self, note_id: &str) -> Result<Vec<NoteVersion>, String> {
        let rows = sqlx::query(
            "SELECT id, note_id, version, body, source, created_at
             FROM note_versions WHERE note_id = ? ORDER BY version DESC",
        )
        .bind(note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|r| {
                Ok(NoteVersion {
                    id: r.try_get(0).map_err(|e| e.to_string())?,
                    note_id: r.try_get(1).map_err(|e| e.to_string())?,
                    version: r.try_get::<i64, _>(2).map_err(|e| e.to_string())?,
                    body: r.try_get(3).map_err(|e| e.to_string())?,
                    source: r.try_get(4).map_err(|e| e.to_string())?,
                    created_at: r.try_get(5).map_err(|e| e.to_string())?,
                })
            })
            .collect()
    }

    /// Restoring writes a NEW version rather than rewinding, so history
    /// stays linear and nothing is silently lost.
    pub async fn restore_note_version(
        &self,
        note_id: &str,
        version: i64,
    ) -> Result<Note, String> {
        let row = sqlx::query(
            "SELECT body, source FROM note_versions WHERE note_id = ? AND version = ?",
        )
        .bind(note_id)
        .bind(version)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Version {version} no longer exists."))?;

        let body: String = row.try_get(0).map_err(|e| e.to_string())?;
        let _source: String = row.try_get(1).unwrap_or_default();

        let note = self
            .note_for_item_by_id(note_id)
            .await?
            .ok_or_else(|| "Note no longer exists.".to_string())?;

        self.save_note(
            &note.item_id,
            note.playlist_id.as_deref(),
            &note.title,
            &body,
            "restore",
        )
        .await
    }

    async fn note_for_item_by_id(&self, note_id: &str) -> Result<Option<Note>, String> {
        let item_id: Option<String> =
            sqlx::query_scalar("SELECT item_id FROM notes WHERE id = ?")
                .bind(note_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| e.to_string())?
                .flatten();
        match item_id {
            Some(id) => self.note_for_item(&id).await,
            None => Ok(None),
        }
    }
}
