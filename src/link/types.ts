// Types de My Music Link (smart links) intégré à My Music App.

/** Réglages lus dans les variables d'environnement Vercel. */
export type Env = {
  APP_NAME: string;
  META_API_VERSION: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
};

export const env: Env = {
  APP_NAME: 'My Music Link',
  META_API_VERSION: process.env.META_API_VERSION || 'v21.0',
  get SPOTIFY_CLIENT_ID() {
    return process.env.SPOTIFY_CLIENT_ID;
  },
  get SPOTIFY_CLIENT_SECRET() {
    return process.env.SPOTIFY_CLIENT_SECRET;
  },
};

/** Artiste connecté (compte My Music App) + ses réglages Meta. */
export type User = {
  id: string;
  name: string;
  pseudo: string;
  pixel_id: string | null;
  capi_token: string | null;
  test_event_code: string | null;
};

export type Link = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  artist: string;
  artwork_url: string | null;
  accent: string;
  theme: string;
  custom_links: string;
  platforms: string;
  created_at: number;
};
