-- Booking : annuaire des lieux, contacts privés des artistes, campagnes de démarchage
-- (comptes = table users de My Music App).
-- Les tables bk_master_* forment la base maître : lues uniquement depuis /admin/booking et /api/admin/booking.

-- Historique des imports de fichiers (créé en premier : contacts et démarches y font référence)
CREATE TABLE bk_imports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,   -- NULL = import de l'équipe
  filename TEXT NOT NULL,
  sheet TEXT,                            -- onglet choisi dans le classeur
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_duplicates INTEGER NOT NULL DEFAULT 0,
  rows_invalid INTEGER NOT NULL DEFAULT 0,
  venues_matched INTEGER NOT NULL DEFAULT 0,
  venues_created INTEGER NOT NULL DEFAULT 0,
  outreach_created INTEGER NOT NULL DEFAULT 0,
  mapping TEXT NOT NULL DEFAULT '{}',    -- JSON colonne du fichier -> champ
  targets TEXT,                          -- import de l'équipe : ["directory","master"]
  created_at TEXT NOT NULL
);
CREATE INDEX bk_imports_user ON bk_imports (user_id, created_at DESC);

-- Lieux : annuaire partagé (owner_user_id NULL) ou lieux privés d'un artiste
CREATE TABLE bk_venues (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published (lieux partagés ; les lieux privés sont 'published')
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  match_key TEXT NOT NULL,               -- nom + ville normalisés (src/booking/normalize.ts)
  type TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  city TEXT,
  department TEXT,
  region TEXT,
  capacity INTEGER,
  website TEXT,
  instagram TEXT,
  booking_period TEXT,                   -- période de bouclage de la programmation
  usual_format TEXT,
  public_notes TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX bk_venues_shared_slug ON bk_venues (slug) WHERE owner_user_id IS NULL;
CREATE INDEX bk_venues_owner ON bk_venues (owner_user_id, match_key);
CREATE INDEX bk_venues_match ON bk_venues (match_key);

-- Contacts privés d'un artiste
CREATE TABLE bk_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id TEXT REFERENCES bk_venues (id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  email TEXT,
  email_normalized TEXT,                 -- NULL si absent ou invalide
  email_valid INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  instagram TEXT,
  notes TEXT,
  import_id TEXT REFERENCES bk_imports (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id)                   -- cible des clés composites de bk_outreach
);
CREATE UNIQUE INDEX bk_contacts_email ON bk_contacts (user_id, email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX bk_contacts_venue ON bk_contacts (user_id, venue_id);

-- Base maître (équipe uniquement) : une ligne par contact, dédoublonnée sur dedupe_key
-- (email normalisé, ou lieu + nom + téléphone / Instagram pour les contacts sans email).
-- Copie dénormalisée du lieu : elle reste intacte si l'artiste supprime ses lieux ou son compte.
CREATE TABLE bk_master_contacts (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  venue_id TEXT REFERENCES bk_venues (id) ON DELETE SET NULL,  -- lieu de l'annuaire partagé uniquement
  venue_name TEXT,
  venue_type TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  city TEXT,
  department TEXT,
  region TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  email TEXT,
  email_normalized TEXT,
  email_kind TEXT,                       -- generic | personal (NULL sans email)
  phone TEXT,
  instagram TEXT,
  status TEXT NOT NULL DEFAULT 'to_check',  -- to_check | verified | invalid | removed
  notes TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bk_master_status ON bk_master_contacts (status, first_seen_at DESC);
CREATE INDEX bk_master_place ON bk_master_contacts (region, city);
CREATE INDEX bk_master_email ON bk_master_contacts (email_normalized);

-- Provenance de chaque contact maître (pseudo et nom de fichier conservés tels quels)
CREATE TABLE bk_master_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_contact_id TEXT NOT NULL REFERENCES bk_master_contacts (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  user_label TEXT,
  import_id TEXT REFERENCES bk_imports (id) ON DELETE SET NULL,
  import_filename TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX bk_master_sources_contact ON bk_master_sources (master_contact_id);
CREATE INDEX bk_master_sources_user ON bk_master_sources (user_id);

-- Profil booking de l'artiste (alimente tous les mails)
CREATE TABLE bk_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  stage_name TEXT,
  style TEXT,
  city TEXT,
  epk_url TEXT,
  live_url TEXT,
  smartlink_url TEXT,
  followup_days INTEGER NOT NULL DEFAULT 10,
  signature TEXT,
  updated_at TEXT NOT NULL
);

-- Modèles de mails : Mymusicads (user_id NULL, code T1…T8) ou personnels
CREATE TABLE bk_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  code TEXT,
  based_on TEXT REFERENCES bk_templates (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  usage TEXT NOT NULL,                   -- first_contact | followup_1 | followup_2 | opening | thanks | festival
  venue_types TEXT NOT NULL DEFAULT '[]',  -- types de lieu pour lesquels le modèle est proposé en premier
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX bk_templates_code ON bk_templates (code) WHERE user_id IS NULL;
CREATE INDEX bk_templates_user ON bk_templates (user_id);

-- Campagnes de démarchage
CREATE TABLE bk_campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_period TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id)
);
CREATE INDEX bk_campaigns_user ON bk_campaigns (user_id, created_at DESC);

-- Démarches. Les clés composites (…, user_id) empêchent en base qu'une démarche d'un artiste
-- pointe vers la campagne ou le contact d'un autre. Pas d'action ON DELETE : SQLite remettrait
-- aussi user_id à NULL ; src/booking/repo.ts détache les démarches avant de supprimer.
CREATE TABLE bk_outreach (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  campaign_id TEXT,
  venue_id TEXT NOT NULL REFERENCES bk_venues (id),
  contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'to_contact',
  channel TEXT,
  template_id TEXT REFERENCES bk_templates (id) ON DELETE SET NULL,
  first_contact_at TEXT,
  last_action_at TEXT,
  proposed_dates TEXT,
  deal_type TEXT,
  fee_cents INTEGER,
  notes TEXT,
  import_id TEXT REFERENCES bk_imports (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id, user_id) REFERENCES bk_campaigns (id, user_id),
  FOREIGN KEY (contact_id, user_id) REFERENCES bk_contacts (id, user_id)
);
CREATE INDEX bk_outreach_user ON bk_outreach (user_id, status, last_action_at);
CREATE INDEX bk_outreach_venue ON bk_outreach (venue_id);
CREATE UNIQUE INDEX bk_outreach_campaign_venue ON bk_outreach (campaign_id, venue_id) WHERE campaign_id IS NOT NULL;

-- Listes modifiables par l'équipe (même principe que la table taxonomy d'Inspire)
CREATE TABLE bk_taxonomy (
  facet TEXT PRIMARY KEY,
  vals TEXT NOT NULL
);

INSERT INTO bk_taxonomy (facet, vals) VALUES
('venue_type', '["SMAC / salle de musiques actuelles","Club électro","Bar-concert","Cave / club de jazz","Salle de spectacle","Festival","Tiers-lieu / friche","Café-culture / associatif","Péniche / lieu atypique","Collectif / organisateur de soirées","Tremplin / dispositif"]'),
('genre', '[{"label":"Rap","sub":["Drill","Trap","Boom bap"]},{"label":"Pop","sub":[]},{"label":"R&B","sub":[]},{"label":"Afro","sub":["Afrobeats","Amapiano"]},{"label":"Reggae","sub":["Dancehall"]},{"label":"Électro","sub":["Techno","House","Drum & bass","Disco / funk","Bass music"]},{"label":"Jazz","sub":["Jazz fusion","Soul / funk"]},{"label":"Rock","sub":["Indie","Punk","Metal"]},{"label":"Chanson / variété","sub":[]},{"label":"Musiques du monde","sub":[]}]'),
('usual_format', '["Cachet fixe","Billetterie / recette","Cachet + billetterie","Plateau partagé","Première partie","Chapeau","Défraiement"]'),
('deal_type', '["Cachet","Recette billetterie","Partage de recette","Garantie + partage","Défraiement","Showcase gratuit"]'),
('channel', '["Email","Instagram","Téléphone","Formulaire du lieu","En personne"]'),
('status', '{"to_contact":"À contacter","contacted":"Contacté","followup_1":"Relance 1","followup_2":"Relance 2","discussing":"En discussion","hold":"Option posée","confirmed":"Confirmé","declined":"Refusé","no_reply":"Sans réponse (clos)"}');

-- Modèles Mymusicads T1 à T8 (première version, à valider par l'équipe)
INSERT INTO bk_templates (id, user_id, code, name, usage, venue_types, subject, body, created_at, updated_at) VALUES
('mma-t1', NULL, 'T1', 'Premier contact salle / bar-concert', 'first_contact',
 '["SMAC / salle de musiques actuelles","Bar-concert","Salle de spectacle","Tiers-lieu / friche","Café-culture / associatif","Péniche / lieu atypique"]',
 'Proposition de concert – {nom_artiste} ({style}) – {periode}',
 'Bonjour {prenom_contact},

Je suis {nom_artiste}, artiste {style}. Je prépare des dates pour {periode} et j’aimerais beaucoup jouer à {lieu}, à {ville}.

Vous trouverez ici mon dossier de présentation : {lien_epk}
Une vidéo live : {lien_live}
Mes titres : {lien_smartlink}

Je peux m’adapter à votre format (date seule, plateau partagé, première partie). Seriez-vous disponible pour en parler ?

Merci pour votre temps,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t2', NULL, 'T2', 'Premier contact club électro / collectif', 'first_contact',
 '["Club électro","Collectif / organisateur de soirées"]',
 '{nom_artiste} – set {style} pour vos soirées – {periode}',
 'Hello {prenom_contact},

Je suis {nom_artiste}, je joue {style}. Je suis vos soirées à {lieu} et je pense que mon univers peut coller à votre programmation.

Mes sons : {lien_smartlink}
Un extrait de set : {lien_live}
Mon dossier : {lien_epk}

Je cherche des dates pour {periode}, en warm-up comme en closing. Ça vous dirait d’en discuter ?

Belle journée,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t3', NULL, 'T3', 'Premier contact cave de jazz', 'first_contact',
 '["Cave / club de jazz"]',
 'Proposition de concert – {nom_artiste} – {periode}',
 'Bonjour {prenom_contact},

Je me permets de vous écrire pour vous présenter mon projet, {nom_artiste} ({style}). Nous serions ravis de nous produire à {lieu}, à {ville}, sur la période {periode}.

Notre dossier de présentation : {lien_epk}
Une captation live : {lien_live}
Nos enregistrements : {lien_smartlink}

Nous sommes à votre disposition pour échanger sur la formule (formation, nombre de sets, conditions).

Bien cordialement,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t4', NULL, 'T4', 'Relance 1', 'followup_1', '[]',
 'Re : proposition de concert – {nom_artiste}',
 'Bonjour {prenom_contact},

Je reviens vers vous au sujet de ma proposition de date à {lieu} pour {periode}. Je sais que vos boîtes mail sont chargées, alors je me permets une petite relance.

Mon dossier, pour mémoire : {lien_epk}
Un extrait live : {lien_live}

Avez-vous eu l’occasion d’y jeter un œil ?

Merci d’avance,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t5', NULL, 'T5', 'Relance 2 (dernière)', 'followup_2', '[]',
 'Dernière relance – {nom_artiste} à {lieu}',
 'Bonjour {prenom_contact},

Je vous écris une dernière fois au sujet d’une date à {lieu} pour {periode}. Si ce n’est pas le bon moment, aucun souci : n’hésitez pas à me dire quand vous bouclez votre prochaine programmation, je reviendrai vers vous à ce moment-là.

Mes liens : {lien_epk} · {lien_smartlink}

Merci pour votre attention,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t6', NULL, 'T6', 'Proposition de première partie', 'opening', '[]',
 'Première partie à {lieu} – {nom_artiste}',
 'Bonjour {prenom_contact},

Je suis {nom_artiste}, artiste {style}. Je serais très heureux d’assurer une première partie à {lieu} sur la période {periode}, sur une date dont l’esthétique se rapproche de la mienne.

Mon dossier : {lien_epk}
Un extrait live : {lien_live}
Mes titres : {lien_smartlink}

Je peux m’adapter à un format court et à une installation légère. Pouvons-nous en parler ?

Merci beaucoup,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t7', NULL, 'T7', 'Remerciement après la date', 'thanks', '[]',
 'Merci pour l’accueil à {lieu} !',
 'Bonjour {prenom_contact},

Un grand merci pour l’accueil à {lieu}. C’était un vrai plaisir de jouer chez vous, et merci à toute l’équipe.

Si vous avez des retours, je les prends avec plaisir. Et je serais ravi de revenir pour une prochaine date.

Mes nouveautés : {lien_smartlink}

À très vite,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
('mma-t8', NULL, 'T8', 'Candidature festival / tremplin', 'festival',
 '["Festival","Tremplin / dispositif"]',
 'Candidature – {nom_artiste} ({style}) – {lieu}',
 'Bonjour {prenom_contact},

Je souhaite proposer la candidature de {nom_artiste}, projet {style}, pour {lieu} ({periode}).

Dossier de présentation : {lien_epk}
Vidéo live : {lien_live}
Écoute : {lien_smartlink}

Je reste disponible pour tout complément (fiche technique, disponibilités, conditions).

Bien cordialement,', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z');
