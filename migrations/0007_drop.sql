-- Drop : planificateur de sortie musicale (comptes = table users de My Music App).
-- Pas de RLS sur Turso/SQLite : les droits sont vérifiés dans src/drop/repo.ts
-- (propriétaire / éditeur / lecteur), testés par scripts/test-drop-access.mjs.
-- Dates des tâches et des sorties : texte « AAAA-MM-JJ » (jour à Paris, sans heure).
-- Listes et objets : JSON en texte.

-- Sorties
CREATE TABLE drop_releases (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,                        -- single | clip | ep | album
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  release_date TEXT NOT NULL,                -- J0 (clip de relance : date du clip)
  clip_is_relaunch INTEGER NOT NULL DEFAULT 0,
  platforms TEXT NOT NULL DEFAULT '[]',      -- ["tiktok","instagram","youtube"]
  owned_assets TEXT NOT NULL DEFAULT '[]',   -- ids de src/drop/config/assets.ts
  admin_enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL,                        -- confort | standard | express | urgence
  warnings TEXT NOT NULL DEFAULT '[]',       -- avertissements du moteur
  dismissed_keys TEXT NOT NULL DEFAULT '[]', -- tâches générées supprimées par l'artiste : jamais recréées
  config_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX drop_releases_owner ON drop_releases (owner_id, release_date);

-- Titres d'un EP / album
CREATE TABLE drop_tracks (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES drop_releases (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_focus_single INTEGER NOT NULL DEFAULT 0, -- titre choisi comme single extrait
  single_release_date TEXT,
  has_clip INTEGER NOT NULL DEFAULT 0,
  clip_release_date TEXT
);
CREATE INDEX drop_tracks_release ON drop_tracks (release_id, position);

-- Tâches
CREATE TABLE drop_tasks (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES drop_releases (id) ON DELETE CASCADE,
  track_id TEXT REFERENCES drop_tracks (id) ON DELETE SET NULL,
  plan_key TEXT,                             -- clé du moteur (modèle + titre) ; NULL = tâche ajoutée à la main
  template_task_id TEXT,                     -- NULL = tâche ajoutée à la main
  title TEXT NOT NULL,
  phase TEXT NOT NULL,                       -- preparer | annoncer | sortir | faire_vivre
  module TEXT NOT NULL,                      -- production | admin | reseaux | promo
  priority TEXT NOT NULL DEFAULT 'recommandee',
  platforms TEXT NOT NULL DEFAULT '[]',
  formats TEXT NOT NULL DEFAULT '[]',        -- ids de formats.ts
  status TEXT NOT NULL DEFAULT 'a_produire', -- a_produire | pret | programme | publie
  due_date TEXT NOT NULL,
  offset_days INTEGER,                       -- jours par rapport à la sortie de référence
  date_locked INTEGER NOT NULL DEFAULT 0,    -- date déplacée à la main : le recalage n'y touche pas
  why TEXT,
  how TEXT NOT NULL DEFAULT '[]',
  ideas TEXT NOT NULL DEFAULT '[]',
  checklist TEXT NOT NULL DEFAULT '[]',      -- [{"label": "...", "done": false}]
  alert TEXT,                                -- alerte du moteur (placée aujourd'hui faute de temps)
  notes TEXT,                                -- privé : jamais sur la page publique
  link_url TEXT,                             -- privé : jamais sur la page publique
  position INTEGER NOT NULL DEFAULT 0,       -- ordre dans une colonne du kanban
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX drop_tasks_release ON drop_tasks (release_id, due_date);
CREATE UNIQUE INDEX drop_tasks_plan_key ON drop_tasks (release_id, plan_key) WHERE plan_key IS NOT NULL;

-- Comptes invités sur une sortie
CREATE TABLE drop_members (
  release_id TEXT NOT NULL REFERENCES drop_releases (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',       -- viewer | editor
  invited_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (release_id, user_id)
);
CREATE INDEX drop_members_user ON drop_members (user_id);

-- Liens publics en lecture seule
CREATE TABLE drop_share_links (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES drop_releases (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX drop_share_links_release ON drop_share_links (release_id);
