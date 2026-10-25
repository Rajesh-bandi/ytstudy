-- Phase 3/4 schema: notes with versions, the AI job queue, quizzes,
-- flashcards and companion state.
--
-- Rules honored here:
--  * note_versions is append-only: regenerating never destroys a draft
--  * jobs survive restarts; a crashed run becomes retryable, not lost
--  * every artifact references the item it was made from, so deleting a
--    playlist cascades cleanly without orphaning revisions

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  playlist_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'user', -- user | ai
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_item ON notes(item_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_versions ON note_versions(note_id, version DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- generate_note | generate_quiz | generate_flashcards
  item_id TEXT,
  playlist_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  playlist_id TEXT,
  title TEXT NOT NULL,
  questions TEXT NOT NULL DEFAULT '[]', -- JSON [{prompt, choices[], answer, why}]
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  answers TEXT NOT NULL DEFAULT '[]', -- JSON number[]
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  playlist_id TEXT,
  deck TEXT NOT NULL DEFAULT 'General',
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON flashcards(deck);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating TEXT NOT NULL, -- again | hard | good | easy
  reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON flashcard_reviews(card_id, reviewed_at DESC);
