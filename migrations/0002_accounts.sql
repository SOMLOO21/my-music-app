-- Comptes artistes : pseudo + mot de passe (haché PBKDF2), sessions longues, favoris par compte.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
