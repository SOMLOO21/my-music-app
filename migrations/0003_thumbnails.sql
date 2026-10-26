-- Vignettes conservées (les liens d'image TikTok expirent au bout de quelques jours).
CREATE TABLE thumbnails (
  video_id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  fetched_at TEXT NOT NULL
);
