use std::path::PathBuf;
use std::str::FromStr;

use chrono::Local;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use sqlx::Row;

use crate::models::*;

pub struct Db {
    pub pool: SqlitePool,
}

impl Db {
    pub async fn open() -> Result<Self, Box<dyn std::error::Error>> {
        let dir = app_data_dir()?.join("db");
        tokio::fs::create_dir_all(&dir).await?;

        let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", dir.join("foxstudy.db").display()))
            .expect("path built")
            .journal_mode(SqliteJournalMode::Wal)
            .foreign_keys(true)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new().connect_with(opts).await?;
        let db = Self { pool };
        db.migrate().await?;
        Ok(db)
    }

    async fn migrate(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Every migration is idempotent (CREATE TABLE IF NOT EXISTS), so the
        // whole set is replayed on each open and old databases pick up new
        // tables without a separate version ledger.
        const MIGRATIONS: [&str; 4] = [
            include_str!("../migrations/0001_init.sql"),
            include_str!("../migrations/0002_learning.sql"),
            include_str!("../migrations/0003_ai_memory.sql"),
            include_str!("../migrations/0004_lesson_context_v2.sql"),
        ];
        for sql in MIGRATIONS {
            sqlx::raw_sql(sql).execute(&self.pool).await?;
        }
        Ok(())
    }

    /* ---------------- settings ---------------- */

    pub async fn settings(&self) -> Result<AppSettings, Box<dyn std::error::Error>> {
        let raw: Option<String> =
            sqlx::query_scalar("SELECT value FROM app_settings WHERE key = 'app_settings'")
                .fetch_optional(&self.pool)
                .await?;
        match raw {
            Some(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
            None => Ok(AppSettings::default()),
        }
    }

    pub async fn save_settings(&self, s: &AppSettings) -> Result<(), Box<dyn std::error::Error>> {
        let raw = serde_json::to_string(s)?;
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES ('app_settings', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(raw)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /* ---------------- helpers for schedulers ---------------- */

    pub async fn completed_items(
        &self,
    ) -> Result<std::collections::HashSet<String>, Box<dyn std::error::Error>> {
        let rows: Vec<sqlx::sqlite::SqliteRow> = {
            let raw = sqlx::raw_sql("SELECT DISTINCT item_id FROM completion_events");
            raw.fetch_all(&self.pool).await?
        };
        Ok(rows
            .into_iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .collect())
    }

    pub async fn load_playlists(&self) -> Result<Vec<Playlist>, Box<dyn std::error::Error>> {
        let rows = sqlx::raw_sql(
            "SELECT p.id, p.title, p.source_url, p.source_type, p.task_type, p.daily_target,
                    p.max_daily_items, p.ordering_policy, p.planning_mode, p.color, p.created_at,
                    (SELECT COUNT(*) FROM items i WHERE i.playlist_id = p.id) AS item_count,
                    (SELECT COUNT(DISTINCT c.item_id) FROM completion_events c
                       WHERE c.playlist_id = p.id) AS done_count
             FROM playlists p
             ORDER BY p.created_at ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let source_type_raw: String = row.try_get(3)?;
            let task_type_raw: String = row.try_get(4)?;
            let ordering_raw: String = row.try_get(7)?;
            let planning_raw: String = row.try_get(8)?;
            out.push(Playlist {
                id: row.try_get(0)?,
                title: row.try_get(1)?,
                source_url: row.try_get(2)?,
                source_type: serde_json::from_str(&source_type_raw)?,
                task_type: serde_json::from_str(&task_type_raw)?,
                daily_target: row.try_get(5)?,
                max_daily_items: row.try_get(6)?,
                ordering_policy: serde_json::from_str(&ordering_raw)?,
                planning_mode: serde_json::from_str(&planning_raw)?,
                color: row.try_get(9)?,
                created_at: row.try_get(10)?,
                item_count: row.try_get(11)?,
                completed_count: row.try_get(12)?,
            });
        }
        Ok(out)
    }
}

pub fn app_data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = std::env::var("FOXSTUDY_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_data_dir());
    Ok(dir)
}

fn default_data_dir() -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".local/share")
        });
    base.join("foxstudy")
}

pub fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
