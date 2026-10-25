-- AI memory: chat threads survive restarts, and lesson grounding
-- (public description / chapters) is fetched once per lesson.

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  -- "companion" for the global dock, the item id for a lesson's doubts
  thread TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(thread, created_at);

CREATE TABLE IF NOT EXISTS item_context_cache (
  item_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
