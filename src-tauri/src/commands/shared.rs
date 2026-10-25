use sqlx::sqlite::SqlitePool;
use tauri::State;

use crate::db::Db;

pub type Pool = State<'static, std::sync::Arc<tokio::sync::Mutex<Db>>>;

pub async fn with_db<F, T>(state: Pool, f: F) -> Result<T, String>
where
    F: for<'c> FnOnce(&'c mut Db) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, Box<dyn std::error::Error>>> + Send + 'c>>,
{
    let mut guard = state.lock().await;
    f(&mut guard).await.map_err(|e| e.to_string())
}

/// Convenience for simple read commands operating on the pool directly.
pub async fn one<T, F>(state: Pool, f: F) -> Result<T, String>
where
    F: FnOnce(SqlitePool) -> BoxFuture<T>,
{
    let guard = state.lock().await;
    f(guard.pool.clone()).await
}

pub type BoxFuture<T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send>>;
