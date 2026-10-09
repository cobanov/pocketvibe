-- The youngest age a game suits (4, 9, 13, 16 or 18), set in the
-- pocketvibe-store repository and checked in review. NULL: not rated yet.
-- The iPhone app lists only games rated for its own age rating.
ALTER TABLE games ADD COLUMN age INTEGER;

-- Players' reports of a game (App Store guidelines 1.2 and 4.7.1 ask for a
-- way to report content, and timely answers). Nothing about the player is kept.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  reason TEXT NOT NULL,            -- offensive, broken, copyright, other
  note TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS reports_open ON reports (resolved_at, created_at);
