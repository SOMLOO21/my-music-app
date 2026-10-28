import type { Env } from './types';

/** Adresse publique du site (domaine de la requête : mymusicapp.fr en ligne, localhost en local). */
export const appUrl = (req: Request) => new URL(req.url).origin;

/** Jeton applicatif Spotify (facultatif) : sert à retrouver le lien Spotify lors d'un import depuis Deezer ou Apple Music. */
export async function appToken(env: Env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Spotify token ${res.status}`);
  return (await res.json()) as { access_token: string };
}
