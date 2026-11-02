-- SYNCOPE : studio de vidéos courtes (comptes = table users de My Music App).
-- Les fichiers (sons, hooks convertis, vidéos importées) sont dans Vercel Blob, sous syncope/.

-- « Mes sons » : chaque son importé par un artiste, avec son projet de montage
CREATE TABLE syncope_songs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  blob_path TEXT NOT NULL,
  project TEXT,                -- JSON du projet (grille, extrait, paroles calées, style…)
  created_at TEXT NOT NULL,
  saved_at TEXT
);
CREATE INDEX syncope_songs_user ON syncope_songs (user_id);

-- Banque de hooks : compteurs d'usage (communs à tous les artistes)
CREATE TABLE syncope_hook_stats (
  hook_id TEXT PRIMARY KEY,
  previews INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  exports INTEGER NOT NULL DEFAULT 0,
  last TEXT
);

-- Import de vidéos par lien : chaque import tourne dans une Vercel Sandbox
CREATE TABLE syncope_imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sandbox TEXT,
  status TEXT NOT NULL,        -- downloading | processing | done | error
  progress REAL NOT NULL DEFAULT 0,
  title TEXT,
  file TEXT,                   -- nom du fichier servi par /syncope/media/<file>
  error TEXT,
  rights_ok_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX syncope_imports_user ON syncope_imports (user_id);
