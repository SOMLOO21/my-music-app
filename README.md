# My Music App

Plateforme d'apps de Mymusicads pour les artistes. Première app : **Inspire**, une bibliothèque d'inspirations vidéo (TikTok et Reels Instagram) sélectionnées par l'équipe.

- `/` : accueil My Music App (liste des apps, dans `src/lib/apps.ts`)
- `/inspire` : fil plein écran ou grille, filtres, favoris
- `/compte` : inscription / connexion des artistes (pseudo + mot de passe)
- `/admin` : ajout et configuration des vidéos, artistes inscrits (protégé par mot de passe)
- `/api/inbox?key=…` : réception des vidéos partagées depuis le Raccourci iPhone

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
