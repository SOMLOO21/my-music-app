-- My Music Link : smart links des artistes (comptes = table users de My Music App).
CREATE TABLE ml_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  artwork_url TEXT,
  accent TEXT NOT NULL DEFAULT '#111827',
  theme TEXT NOT NULL DEFAULT '{}',          -- apparence (src/link/theme.ts)
  custom_links TEXT NOT NULL DEFAULT '[]',   -- autres liens [{id, title, url, icon}]
  platforms TEXT NOT NULL DEFAULT '[]',      -- [{key, url}] Spotify / Apple Music / Deezer
  created_at INTEGER NOT NULL
);
CREATE INDEX ml_links_user ON ml_links (user_id);

-- Vues et clics (anonymes) pour les statistiques
CREATE TABLE ml_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL REFERENCES ml_links (id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- view | click
  platform TEXT,               -- spotify | appleMusic | deezer | custom:<id>
  country TEXT,
  source TEXT,
  device TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ml_events_link ON ml_events (link_id, created_at);

-- Pixel Meta + Conversions API de chaque artiste
CREATE TABLE ml_settings (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  pixel_id TEXT,
  capi_token TEXT,
  test_event_code TEXT
);

-- Images importées (fonds, icônes des autres liens), compressées dans le navigateur
CREATE TABLE ml_media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- bg | icon
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
