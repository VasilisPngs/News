CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vector TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  pooled_at INTEGER
);

CREATE TABLE IF NOT EXISTS candidates (
  topic TEXT NOT NULL,
  domain TEXT NOT NULL,
  tried INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (topic, domain)
);

CREATE INDEX IF NOT EXISTS candidates_open ON candidates (tried);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  site TEXT NOT NULL,
  feed TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  icon TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  topic TEXT
);

CREATE TABLE IF NOT EXISTS feeds (
  url TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  lang TEXT,
  fetched_at INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  modified TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS feeds_owner ON feeds (owner);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  owner TEXT NOT NULL,
  story TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  lang TEXT,
  published_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  tokens TEXT NOT NULL,
  vector TEXT,
  affinity REAL NOT NULL DEFAULT 0,
  opened_at INTEGER,
  hidden_at INTEGER,
  saved_at INTEGER,
  notified_at INTEGER,
  image TEXT,
  dwell INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  viewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS articles_time ON articles (published_at);
CREATE INDEX IF NOT EXISTS articles_story ON articles (story);
CREATE INDEX IF NOT EXISTS articles_owner ON articles (owner);
CREATE INDEX IF NOT EXISTS articles_kept ON articles (saved_at, seen_at);
CREATE INDEX IF NOT EXISTS articles_unembedded ON articles (published_at) WHERE vector IS NULL;
CREATE INDEX IF NOT EXISTS articles_imageless ON articles (published_at) WHERE image IS NULL;
CREATE INDEX IF NOT EXISTS articles_hidden ON articles (story) WHERE hidden_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS articles_notified ON articles (story) WHERE notified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS errors (
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  agent TEXT
);
