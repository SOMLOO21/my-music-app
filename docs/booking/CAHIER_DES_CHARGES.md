# My Music App — Module « Booking »
Cahier des charges · version 1 · 2 novembre 2026 · porteur : Jérémy (Mymusicads)

> Document de référence pour le développement du module Booking dans le dépôt `SOMLOO21/my-music-app`.
> À placer dans le dépôt sous `docs/booking/CAHIER_DES_CHARGES.md` : le prompt Claude Code s'y réfère.

---

## 1. Vision

Booking est la 4ᵉ app de My Music App, après Inspire, Link et Syncope.

Elle aide les artistes, et en premier lieu les apprenants Mymusicads, à **trouver les lieux qui correspondent à leur musique**
(salles de musiques actuelles, clubs électro, caves de jazz, bars-concerts, festivals…) et à **mener leurs campagnes de démarchage** :
mails prêts à envoyer, suivi des démarches, relances au bon moment.

Pour l'équipe Mymusicads, l'app a un second rôle : **constituer une base de contacts booking interne**, qui grandit
à chaque import de fichier fait par un apprenant.

## 2. Utilisateurs et droits

| Profil | Accès | Ce qu'il voit |
|---|---|---|
| Artiste / apprenant (compte My Music App existant) | `/booking` | L'annuaire partagé (infos des lieux), **ses propres** contacts, imports, démarches et campagnes |
| Équipe Mymusicads (mot de passe admin existant `SITE_PASSWORD`) | `/admin/booking` | Tout : base maître des contacts, sources, annuaire à publier, activité des artistes |

**Règle absolue de confidentialité :**

- un artiste ne voit **jamais** les contacts, imports, notes ou démarches d'un autre artiste ;
- la **base maître** est réservée à l'équipe, pour un **usage interne uniquement**. Elle n'est jamais exposée aux artistes.

## 3. Périmètre fonctionnel

### 3.1 Annuaire des lieux (partagé)

- Liste des lieux publiés par l'équipe, avec recherche et filtres :
  - type de lieu ;
  - esthétiques ;
  - ville / département / région ;
  - jauge (tranches) ;
  - format habituel.
- Types de lieu (liste modifiable par l'admin) :
  - SMAC / salle de musiques actuelles ;
  - club électro ;
  - bar-concert ;
  - cave / club de jazz ;
  - salle de spectacle ;
  - festival ;
  - tiers-lieu / friche ;
  - café-culture / associatif ;
  - péniche / lieu atypique ;
  - collectif / organisateur de soirées ;
  - tremplin / dispositif.
- Esthétiques : reprendre la logique de taxonomie d'Inspire (rap, pop, R&B, afro, électro avec sous-genres techno, house…, jazz, rock, variété…), modifiable par l'admin.
- **Fiche lieu**, avec les champs suivants :
  - nom, type, esthétiques, ville, département, région, jauge ;
  - site, Instagram ;
  - période de bouclage de la programmation ;
  - format habituel (cachet, billetterie, plateau…) ;
  - notes publiques de l'équipe ;
  - date de dernière vérification.
- **Pas de contacts dans l'annuaire partagé.** L'artiste y trouve les infos du lieu ; les contacts sont les siens (import ou saisie).
- Depuis une fiche : « Ajouter à une campagne », et « Ajouter mon contact pour ce lieu » (contact privé).

### 3.2 Mes contacts (privé)

- Contacts saisis à la main ou importés, rattachés si possible à un lieu de l'annuaire.
- Un contact sans lieu correspondant crée un **lieu privé**, visible seulement par l'artiste.
- Modifier, supprimer, exporter (CSV) ses contacts.

### 3.3 Import de fichier

- Formats acceptés :
  - **MVP** : .xlsx et .csv ;
  - **V1** : lien Google Sheets public (export CSV).
- Parcours :
  1. dépôt du fichier ;
  2. **correspondance des colonnes**, proposée automatiquement (« Mail prog » → email) puis corrigeable ;
  3. aperçu des 10 premières lignes ;
  4. rapport de rapprochement : X lieux reconnus dans l'annuaire, Y nouveaux lieux privés, Z doublons ignorés ;
  5. validation.
- Reconnaissance automatique des colonnes du **modèle Excel de suivi Mymusicads**, dont les onglets « Lieux » et « Suivi démarchage ».
- Si le fichier contient des statuts et des dates de démarches, elles sont importées dans le pipeline.
- Dédoublonnage côté artiste : même email normalisé, ou même nom de lieu + ville.
- **Mention affichée avant validation** (texte à faire valider) :
  > « Les contacts importés restent privés dans ton espace. Ils sont également conservés par l'équipe Mymusicads
  > pour un usage interne. Un contact peut demander à être retiré à tout moment. »
- Chaque import est historisé : fichier, date, nombre de lignes, correspondance utilisée.
- **Copie vers la base maître** à chaque validation (voir 3.7). Si l'artiste supprime ensuite ses contacts, la copie maître reste.

### 3.4 Campagnes et mails

- Une campagne = un objectif (ex. « Tournée Ouest printemps 2027 »), une période visée, une liste de lieux et contacts.
- **Modèles de mails** fournis par Mymusicads, avec variables `{prenom_contact}`, `{lieu}`, `{ville}`, `{nom_artiste}`, `{style}`, `{periode}`, `{lien_epk}`, `{lien_live}`, `{lien_smartlink}` :
  - T1 : premier contact salle / bar-concert ;
  - T2 : premier contact club électro / collectif ;
  - T3 : premier contact cave de jazz ;
  - T4 : relance 1 ;
  - T5 : relance 2 (dernière) ;
  - T6 : proposition de première partie ;
  - T7 : remerciement après la date ;
  - T8 : candidature festival / tremplin.
- L'artiste peut dupliquer et modifier un modèle (modèles personnels).
- **Génération du mail** pour chaque lieu : le modèle est rempli avec les infos du lieu et du profil.
  - Option « Personnaliser avec l'IA » : le SDK Anthropic est déjà dans le projet. L'IA ajoute une phrase sur la programmation du lieu, **sans jamais inventer de fait**. Le bouton n'est actif que si la clé API est configurée.
- **Envoi au MVP** : bouton « Copier » et lien `mailto:` pré-rempli. L'envoi direct depuis Gmail ou Outlook est prévu en V2.
- Le profil booking de l'artiste (nom de scène, style, ville, liens EPK, live, smart link) se remplit une fois et alimente tous les mails. Si l'artiste a des smart links dans Link, il peut en choisir un.

### 3.5 Pipeline et relances

- Statuts d'une démarche :
  - À contacter ;
  - Contacté ;
  - Relance 1 ;
  - Relance 2 ;
  - En discussion ;
  - Option posée ;
  - Confirmé ;
  - Refusé ;
  - Sans réponse (clos).
- Vue liste filtrable, et vue colonnes par statut (kanban, en V1 si le temps manque).
- Chaque démarche contient :
  - canal ;
  - modèle utilisé ;
  - date du 1er contact ;
  - date de dernière action ;
  - date(s) proposée(s) ;
  - type de deal ;
  - cachet / conditions ;
  - notes.
- **Relance calculée** : dernière action + délai (10 jours par défaut, réglable par l'artiste).
  - Une liste « À relancer aujourd'hui » s'affiche en tête de l'app.
  - La relance n'est pas proposée pour les statuts Confirmé, Refusé, Sans réponse et À contacter.
- Passer une démarche en « Contacté » met à jour la date de dernière action.

### 3.6 Tableau de bord artiste

- Lieux en campagne ;
- démarches envoyées ;
- taux de réponse ;
- dates confirmées ;
- relances en retard ;
- total des cachets confirmés.

### 3.7 Admin — base maître (`/admin/booking`)

- **Base maître des contacts** :
  - tous les contacts issus des imports et saisies, dédoublonnés (email normalisé) ;
  - pour chaque contact, ses **sources** : quel artiste, quel import, quelle date.
- Filtres : ville, région, type de lieu, esthétique, type d'email (générique ou nominatif), date d'ajout.
- Export CSV / XLSX de la base maître filtrée.
- Statut de chaque contact : à vérifier, vérifié, invalide, **retiré** (demande de retrait).
  - Un contact « retiré » n'est plus exporté.
  - Il n'est plus réimporté dans la base maître lors des imports suivants.
- **Gestion de l'annuaire partagé** :
  - créer, modifier et publier des lieux ;
  - promouvoir un lieu privé importé en lieu partagé (seules les infos du lieu sont partagées, jamais les contacts) ;
  - fusionner des doublons.
- Import admin : charger un fichier directement dans l'annuaire et la base maître.
- Activité par artiste : contacts importés, démarches, dates confirmées.
- Réglages : listes (types de lieu, esthétiques, statuts, types de deal) et modèles de mails Mymusicads.

## 4. Hors périmètre du MVP (V2 et après)

- Espace lieu : revendication de fiche, règles de contact, créneaux à remplir, **boîte de candidatures** (spec détaillée à part) ;
- envoi des mails depuis Gmail / Outlook connecté, suivi des réponses ;
- indice de compatibilité artiste ↔ lieu ;
- pages publiques indexables « salles [style] à [ville] » pour le SEO ;
- import par lien Google Sheets (V1) ;
- calendrier des dates confirmées.

## 5. Intégration technique (dépôt `my-music-app`)

| Élément existant | Réutilisation |
|---|---|
| Next.js 16, React 19, Tailwind 4, Vercel | Même stack, même style visuel (thème sombre, couleur d'accent de l'app) |
| Turso / SQLite via `src/lib/sql.ts` (`prepare / bind / all / first / run / batch`) | Toutes les requêtes Booking passent par cette interface |
| `migrations/*.sql` + `npm run db:migrate` | Nouvelle migration `0006_booking.sql`, tables préfixées `bk_` |
| Comptes `users` + `currentUser()` (`src/lib/accounts.ts`) | Seule source d'identité de l'artiste ; aucun nouveau système de comptes |
| `src/proxy.ts` : `/admin` et `/api` protégés par `SITE_PASSWORD` ; `/api/account` et `/api/favorites` publics | API artiste sous `/api/booking/*`, **ajoutée à `PUBLIC_API`**, chaque route vérifiant la session. API admin sous `/api/admin/booking/*`, protégée par le proxy |
| `src/lib/apps.ts` | Nouvelle tuile « Booking » |
| `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` | Personnalisation des mails (optionnelle) |
| Mode admin « se connecter en tant que » | Doit fonctionner aussi sur `/booking` |

**Cloisonnement :**

- Turso/SQLite n'a pas de règles d'accès par ligne. **Toute requête artiste filtre explicitement sur `user_id = currentUser().id`.**
- Ces requêtes sont regroupées dans `src/booking/repo.ts`, et chaque fonction prend l'`userId` en paramètre obligatoire.
- Les routes artistes ne reçoivent **jamais** un `user_id` venant du client.
- L'accès à un objet par son `id` vérifie toujours qu'il appartient à l'utilisateur ; sinon, la route renvoie 404.

## 6. Modèle de données (proposition — Claude Code peut l'ajuster en le justifiant)

```
bk_venues           lieux (partagés ou privés)
  id, owner_user_id NULL (NULL = annuaire partagé ; sinon lieu privé d'un artiste),
  status (draft | published), name, slug, type, genres JSON, city, department, region,
  capacity INTEGER, website, instagram, booking_period, usual_format, public_notes,
  verified_at, created_at, updated_at

bk_contacts         contacts privés d'un artiste
  id, user_id, venue_id, first_name, last_name, role, email, email_normalized,
  phone, instagram, notes, import_id NULL, created_at, updated_at
  UNIQUE (user_id, email_normalized) quand email présent

bk_imports          historique des imports
  id, user_id NULL (NULL = import admin), filename, rows_total, rows_imported,
  rows_duplicates, venues_matched, venues_created, mapping JSON, created_at

bk_master_contacts  base maître (équipe uniquement)
  id, venue_id NULL, venue_name, city, first_name, last_name, role, email,
  email_normalized UNIQUE, email_kind (generic | personal), phone, instagram,
  status (to_check | verified | invalid | removed), first_seen_at, last_seen_at

bk_master_sources   provenance de chaque contact maître
  master_contact_id, user_id NULL, import_id NULL, created_at

bk_profiles         profil booking de l'artiste
  user_id PK, stage_name, style, city, epk_url, live_url, smartlink_url,
  followup_days DEFAULT 10, signature

bk_templates        modèles de mails
  id, user_id NULL (NULL = modèle Mymusicads), code, name, usage, subject, body, created_at

bk_campaigns        campagnes
  id, user_id, name, target_period, notes, created_at

bk_outreach         démarches
  id, user_id, campaign_id NULL, venue_id, contact_id NULL, status, channel,
  template_id NULL, first_contact_at, last_action_at, proposed_dates, deal_type,
  fee_cents NULL, notes, created_at, updated_at

bk_taxonomy         listes modifiables (même principe que la table taxonomy d'Inspire)
```

## 7. Règles de qualité

- Interface en français, tutoiement (comme le reste de l'app), **mobile d'abord**.
- Aucune donnée inventée : la génération IA n'ajoute que ce qui est dans la fiche lieu ou le profil.
- Emails normalisés (minuscules, espaces supprimés) et validés au format.
- Imports robustes :
  - encodages UTF-8 et Windows-1252 ;
  - séparateurs `;` et `,` ;
  - lignes vides ;
  - colonnes en trop.
- Limite d'import : 5 000 lignes par fichier ; au-delà, l'app affiche un message clair.
- Commentaires et noms de fonctions en français dans l'esprit du code existant.
- Pas de nouvelle dépendance sans justification. Pour lire les .xlsx, choisir une bibliothèque maintenue et sans faille connue.

## 8. Critères de réussite du MVP

1. Un apprenant importe le modèle Excel Mymusicads et retrouve ses lieux et démarches dans l'app en moins de 2 minutes.
2. Il crée une campagne de 20 lieux et obtient 20 mails prêts à copier.
3. Les relances du jour s'affichent sans action de sa part.
4. L'équipe voit dans `/admin/booking` chaque nouveau contact, avec sa source, et peut exporter la base.
5. Un test automatisé prouve qu'un artiste A ne peut lire ni modifier aucune donnée d'un artiste B.

## 9. Questions encore ouvertes

- Texte exact de la mention à l'import et des CGU (validation juridique).
- Qui vérifie les contacts de la base maître (équipe, alternant) et à quel rythme.
- Booking est-il réservé aux apprenants (code d'accès, liste blanche) ou ouvert à tous les comptes My Music App ?
- Régions et esthétiques à prioriser pour remplir l'annuaire partagé au lancement.
