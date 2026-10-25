-- The first context cache stored whatever a page scrape could see, often just
-- the description. Transcript-aware context is a different shape, so it gets
-- its own table instead of silently serving thin entries.
CREATE TABLE IF NOT EXISTS item_context_cache_v2 (
  item_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
