-- Games as the store lists them: one row per game, holding its published version.
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,             -- GitHub login of the developer who owns the id
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  controls TEXT NOT NULL DEFAULT '{}', -- JSON: button -> action
  entry TEXT NOT NULL DEFAULT 'index.html',
  version TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  zip_key TEXT NOT NULL,
  cover_key TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every uploaded version. Uploads from developers wait as 'pending' until reviewed.
CREATE TABLE IF NOT EXISTS releases (
  game_id TEXT NOT NULL,
  version TEXT NOT NULL,
  uploader TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'rejected')),
  manifest TEXT NOT NULL,          -- JSON of pocketvibe.json
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  zip_key TEXT NOT NULL,
  cover_key TEXT,
  note TEXT,                       -- reason given when rejected
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  PRIMARY KEY (game_id, version)
);

CREATE INDEX IF NOT EXISTS releases_status ON releases (status);
CREATE INDEX IF NOT EXISTS games_updated ON games (updated_at);
