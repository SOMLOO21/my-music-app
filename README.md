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
npm run db:migrate:local
npm run dev
```

Puis ouvrir http://localhost:3000. En local, l'admin n'a pas de mot de passe.

## Mise en ligne (Cloudflare Workers + D1)

```bash
npm run db:migrate:remote   # si une nouvelle migration a été ajoutée dans migrations/
npm run deploy
```

Secrets à définir une fois sur Cloudflare :

```bash
npx wrangler secret put SITE_PASSWORD --name inspire   # mot de passe de l'admin
npx wrangler secret put INBOX_KEY --name inspire       # clé du Raccourci iPhone
```

## Organisation

- `src/lib/db.ts` : vidéos et filtres (base D1)
- `src/lib/accounts.ts` : comptes artistes, sessions, favoris
- `src/lib/links.ts` : analyse des liens TikTok / Instagram
- `src/lib/thumbnails.ts` : vignettes conservées en base (les liens TikTok expirent)
- `src/lib/classify.ts` : tags proposés automatiquement (règles ; IA si `ANTHROPIC_API_KEY` est définie)
- `src/middleware.ts` : protection de l'admin et de l'API
- `migrations/` : structure de la base
