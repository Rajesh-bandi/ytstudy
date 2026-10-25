-- FoxStudy initial schema
-- Rules honored here:
--  * completion_events is append-only (no UPDATE path, no cascade delete of events)
--  * scheduled_tasks rows for completed items are never erased by replanning
--  * every durable entity has a UUID PK for later cross-device sync

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  task_type TEXT NOT NULL DEFAULT 'mixed',
  daily_target INTEGER NOT NULL DEFAULT 1 CHECK (daily_target >= 1),
  max_daily_items INTEGER,
  ordering_policy TEXT NOT NULL DEFAULT 'strict',
  planning_mode TEXT NOT NULL DEFAULT 'sequential',
  color TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  source_item_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  topic TEXT,
  difficulty INTEGER,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_playlist ON items(playlist_id, position);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  strategy TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  planned_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  office_position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON scheduled_tasks(planned_date);
CREATE INDEX IF NOT EXISTS idx_tasks_playlist ON scheduled_tasks(playlist_id, planned_date);

-- append-only; deleting an item erases its schedule rows via FK cascade but
-- past COMPLETIONS must survive -> events reference item_id + denormalized
-- playlist/date so streak/heatmap math stays correct after any cascade.
CREATE TABLE IF NOT EXISTS completion_events (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  item_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'complete'
);
CREATE INDEX IF NOT EXISTS idx_events_item ON completion_events(item_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON completion_events(completed_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
