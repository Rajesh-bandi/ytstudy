#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod commands;
mod db;
mod jobs;
mod models;
mod notes;
mod scheduler;

use std::sync::Arc;
use tokio::sync::Mutex;

/// Shared handle to the SQLite layer. Commands take `State<'_, AppDb>`.
pub type AppDb = Arc<Mutex<db::Db>>;

fn main() {
    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    runtime.block_on(main_async());
}

async fn main_async() {
    let db = match db::Db::open().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("ytstudy: database open failed: {e:?}");
            std::process::exit(1);
        }
    };

    // `ytstudy --rebuild` replans and prints the diff, then exits. Useful for
    // checking the scheduler against real data without opening a window.
    if std::env::args().any(|a| a == "--rebuild") {
        match crate::scheduler::rebuild(&db, None).await {
            Ok(diff) => println!(
                "rebuilt: added={} moved={} dropped={} version={}",
                diff.added, diff.moved, diff.dropped, diff.version
            ),
            Err(e) => eprintln!("rebuild failed: {e:?}"),
        }
        return;
    }

    let shared: AppDb = Arc::new(Mutex::new(db));

    // `ytstudy --optimize` runs the companion's whole-plan review and prints
    // the result, then exits. Same engine the Planner button uses.
    if std::env::args().any(|a| a == "--optimize") {
        match commands::ai_plan::optimize_plan(&shared).await {
            Ok(r) => println!(
                "optimised: playlists={} moved={} note={}",
                r.playlists, r.moved, r.note
            ),
            Err(e) => eprintln!("optimise failed: {e}"),
        }
        return;
    }

    // Startup recovery: give every playlist today + horizon coverage without
    // touching completed history.
    {
        let mut guard = shared.lock().await;
        if let Err(e) = crate::scheduler::autoheal(&mut guard).await {
            eprintln!("ytstudy: startup schedule heal failed: {e:?}");
        }
    }

    // Day rollover: when the app is left open overnight, replan the morning
    // once the local date changes instead of waiting for a restart.
    {
        let heal_db = shared.clone();
        tauri::async_runtime::spawn(async move {
            let mut last_day = db::today_key();
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(600)).await;
                let today = db::today_key();
                if today != last_day {
                    last_day = today;
                    let guard = heal_db.lock().await;
                    if let Err(e) = crate::scheduler::autoheal(&guard).await {
                        eprintln!("ytstudy: day rollover heal failed: {e:?}");
                    }
                }
            }
        });
    }

    // Background job worker. Drains the queue, then idles; jobs survive a
    // restart because they live in SQLite.
    {
        let worker_db = shared.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                match jobs::worker_tick(&worker_db).await {
                    Ok(true) => continue,
                    Ok(false) => {}
                    Err(e) => eprintln!("ytstudy: job worker error: {e}"),
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        });
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(shared)
        .invoke_handler(tauri::generate_handler![
            commands::playlists::list_playlists,
            commands::playlists::create_playlist,
            commands::playlists::update_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::list_items,
            commands::playlists::add_item,
            commands::playlists::delete_item,
            commands::playlists::reorder_item,
            commands::playlists::import_playlist,
            commands::youtube::fetch_youtube_playlist,
            commands::tasks::rebuild_schedule,
            commands::tasks::reschedule_task,
            commands::tasks::complete_task,
            commands::tasks::uncomplete_task,
            commands::tasks::get_day_plan,
            commands::tasks::get_range_plans,
            commands::stats::get_dashboard,
            commands::stats::get_streaks,
            commands::stats::get_heatmap,
            commands::stats::get_playlist_progress,
            commands::stats::get_completions_by_day,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::settings::wipe_learning_data,
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::save_note,
            commands::notes::note_versions,
            commands::notes::restore_note_version,
            commands::ai::get_ai_config,
            commands::ai::set_ai_config,
            commands::ai::test_ai_connection,
            commands::ai::ai_chat,
            commands::ai::enqueue_generation,
            commands::ai::list_jobs,
            commands::ai::retry_job,
            commands::ai::list_chat,
            commands::ai::clear_chat,
            commands::ai_plan::ai_reorder_playlist,
            commands::ai_plan::ai_optimize_plan,
            commands::revision::list_quizzes,
            commands::revision::submit_quiz,
            commands::revision::list_flashcards,
            commands::revision::review_flashcard,
            commands::revision::get_artifacts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ytstudy");
}
