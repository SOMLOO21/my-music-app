# My Music App

Plateforme d'apps de Mymusicads pour les artistes :

- **Inspire** : une bibliothèque d'inspirations vidéo (TikTok et Reels Instagram) sélectionnées par l'équipe.
- **Link** : des smart links (Spotify, Apple Music, Deezer + liens libres) avec pixel Meta et Conversions API, statistiques et pages personnalisables.

- `/` : accueil My Music App (liste des apps, dans `src/lib/apps.ts`)
- `/inspire` : fil plein écran ou grille, filtres, favoris
- `/compte` : inscription / connexion des artistes (pseudo + mot de passe)
- `/admin` : ajout et configuration des vidéos, artistes inscrits (protégé par mot de passe)
- `/api/inbox?key=…` : réception des vidéos partagées depuis le Raccourci iPhone
- `/link` : espace artiste My Music Link (mêmes comptes que `/compte`) : liens, apparence, statistiques, pixel Meta
- `/l/<titre>` : smart link public ouvert par les fans ; `/l/go/…` redirige vers la plateforme et compte le clic

## Développement local

```bash
npm install
echo "TURSO_DATABASE_URL=file:local.db" >> .env.local   # base de test locale
npm run db:migrate
npm run dev
```

Puis ouvrir http://localhost:3000. En local, l'admin n'a pas de mot de passe.

## Mise en ligne (Vercel + Turso)

Chaque envoi sur la branche `main` de GitHub est déployé automatiquement par Vercel.
Si une nouvelle migration est ajoutée dans `migrations/`, l'appliquer sur la base en ligne :

```bash
vercel env pull .env.production.local --environment production
node --env-file=.env.production.local scripts/migrate.mjs
```

Variables d'environnement à définir sur Vercel :

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` : base Turso (ajoutées par l'intégration Turso)
- `SITE_PASSWORD` : mot de passe de l'admin
- `INBOX_KEY` : clé du Raccourci iPhone
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (facultatif) : retrouver le lien Spotify quand un smart link est importé depuis Deezer ou Apple Music

## Organisation

- `src/lib/sql.ts` : connexion à la base Turso (SQLite)
- `src/lib/db.ts` : vidéos et filtres
- `src/lib/accounts.ts` : comptes artistes, sessions, favoris
- `src/lib/links.ts` : analyse des liens TikTok / Instagram
- `src/lib/thumbnails.ts` : vignettes conservées en base (les liens TikTok expirent)
- `src/lib/classify.ts` : tags proposés automatiquement (règles ; IA si `ANTHROPIC_API_KEY` est définie)
- `src/proxy.ts` : protection de l'admin et de l'API
- `migrations/` : structure de la base (`npm run db:migrate`)
- `scripts/import-d1.mjs` : import d'un export de l'ancienne base Cloudflare D1
- `src/link/` : My Music Link (routeur Hono monté par `src/app/link/[[...path]]` et `src/app/l/[...path]`), tables `ml_*` (`migrations/0004_mymusiclink.sql`). Les images importées (fonds, icônes) sont compressées dans le navigateur puis stockées en base (`ml_media`).
