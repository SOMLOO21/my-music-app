-- Bibliothèque : chaque vidéo est stockée en JSON, avec quelques colonnes indexées.
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE (platform, external_id)
);
CREATE INDEX videos_status_created ON videos (status, created_at DESC);

-- Valeurs de chaque filtre (type, genre, style, hook, lieu), dans l'ordre d'affichage.
CREATE TABLE taxonomy (
  facet TEXT PRIMARY KEY,
  vals TEXT NOT NULL
);
