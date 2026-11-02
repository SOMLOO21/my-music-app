// Banque de clips par mood : Pexels si une clé existe, sinon Pixabay. Les clés restent sur le serveur
// (variables d'environnement PEXELS_API_KEY / PIXABAY_API_KEY).

export interface Clip {
  id: string;
  thumb: string;
  duration: number;
  w: number;
  h: number;
  author: string;
  author_url: string;
  page: string;
  file: string;
  preview: string;
}

type Provider = 'pexels' | 'pixabay';

export class BankError extends Error {
  constructor(message: string, readonly status: number, readonly needKey = false) {
    super(message);
  }
}

// Moods de la banque : chaque mood lance plusieurs recherches en anglais.
export const MOODS = [
  { id: 'nuit', name: 'Nuit urbaine', colors: ['#1b2a6b', '#0a0f2c'], queries: ['city night', 'night street lights', 'night traffic city'] },
  { id: 'neon', name: 'Néon', colors: ['#ff2bd6', '#2b6bff'], queries: ['neon lights', 'neon sign', 'neon city night'] },
  { id: 'fumee', name: 'Fumée & ombres', colors: ['#3a3a3a', '#0d0d0d'], queries: ['smoke dark background', 'silhouette smoke', 'dark fog'] },
  { id: 'route', name: 'Route & voitures', colors: ['#c2410c', '#1c1917'], queries: ['car driving night', 'highway night', 'sports car'] },
  { id: 'club', name: 'Club & fête', colors: ['#a21caf', '#1e1b4b'], queries: ['party crowd', 'club lights', 'concert crowd'] },
  { id: 'melancolie', name: 'Mélancolie', colors: ['#475569', '#0f172a'], queries: ['rain window', 'rainy street', 'lonely person'] },
  { id: 'rue', name: 'Rue & quartier', colors: ['#57534e', '#1c1917'], queries: ['urban street', 'graffiti wall', 'street basketball'] },
  { id: 'luxe', name: 'Luxe', colors: ['#ca8a04', '#1c1917'], queries: ['luxury lifestyle', 'gold jewelry', 'champagne'] },
  { id: 'amour', name: 'Amour', colors: ['#e11d48', '#4c0519'], queries: ['romantic couple', 'couple holding hands', 'love couple sunset'] },
  { id: 'evasion', name: 'Évasion & nature', colors: ['#0e7490', '#082f49'], queries: ['ocean waves', 'sunset sky', 'forest aerial'] },
  { id: 'retro', name: 'Rétro & VHS', colors: ['#d97706', '#7c2d12'], queries: ['vintage film', 'retro 80s', 'old film footage'] },
  { id: 'energie', name: 'Énergie & sport', colors: ['#16a34a', '#052e16'], queries: ['skateboarding', 'running athlete', 'boxing training'] },
  { id: 'feu', name: 'Feu & étincelles', colors: ['#ea580c', '#450a0a'], queries: ['fire flames', 'sparks', 'fireworks night'] },
  { id: 'abstrait', name: 'Abstrait', colors: ['#7c3aed', '#0c4a6e'], queries: ['abstract liquid', 'ink in water', 'light leaks'] },
];
export const MOOD_BY_ID = new Map(MOODS.map((m) => [m.id, m]));

const apiKey = (p: Provider) => (process.env[`${p.toUpperCase()}_API_KEY`] || '').trim();

/** Banque utilisée : Pexels si une clé existe (ils ont suspendu les nouvelles clés), sinon Pixabay. */
export function provider(): Provider | null {
  return (['pexels', 'pixabay'] as const).find((p) => apiKey(p)) ?? null;
}

// Pixabay demande de garder les résultats en cache 24 h (cache par instance du serveur).
const cache = new Map<string, { at: number; data: unknown }>();

async function fetchJson(url: string, headers: Record<string, string>, ttl: number) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl * 1000) return hit.data as Record<string, unknown>;
  const r = await fetch(url, { headers: { ...headers, 'User-Agent': 'SYNCOPE/1.0' }, signal: AbortSignal.timeout(20_000) });
  if ([400, 401, 403].includes(r.status)) throw new BankError('Clé refusée par la banque', 401, true);
  if (r.status === 429) throw new BankError('Trop de recherches d’un coup : attends une minute.', 429);
  if (!r.ok) throw new BankError(`Banque indisponible (${r.status})`, 502);
  const data = await r.json();
  cache.set(url, { at: Date.now(), data });
  return data as Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- réponses brutes des API Pexels / Pixabay */
function simplifyPexels(v: any): Clip | null {
  const files = (v.video_files || []).filter((f: any) => f.link && (f.file_type || '').endsWith('mp4'));
  if (!files.length) return null;
  const short = (f: any) => Math.min(f.width || 0, f.height || 0);
  const full = files.filter((f: any) => short(f) > 0 && short(f) <= 1080);
  const best = (full.length ? full : files).reduce((a: any, b: any) => (short(b) > short(a) ? b : a));
  const light = files.filter((f: any) => short(f) >= 240);
  const preview = (light.length ? light : files).reduce((a: any, b: any) => (short(b) < short(a) ? b : a));
  const user = v.user || {};
  return {
    id: `px-${v.id}`, thumb: v.image, duration: v.duration || 0, w: v.width, h: v.height,
    author: user.name || 'Pexels', author_url: user.url || 'https://www.pexels.com', page: v.url,
    file: best.link, preview: preview.link,
  };
}

function simplifyPixabay(h: any): Clip | null {
  const vids = h.videos || {};
  const best = vids.medium || vids.large || vids.small;
  const light = vids.tiny || vids.small || best;
  if (!best?.url) return null;
  return {
    id: `pb-${h.id}`, thumb: vids.small?.thumbnail || light.thumbnail || best.thumbnail,
    duration: h.duration || 0, w: best.width, h: best.height,
    author: h.user || 'Pixabay', author_url: `https://pixabay.com/users/${h.user || ''}-${h.user_id || ''}/`,
    page: h.pageURL, file: best.url, preview: light.url,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function pexelsSearch(query: string, orientation: string, page: number, perPage: number, key = apiKey('pexels')) {
  const params = new URLSearchParams({ query, page: String(page), per_page: String(perPage), size: 'medium' });
  if (orientation) params.set('orientation', orientation);
  const data = await fetchJson(`https://api.pexels.com/videos/search?${params}`, { Authorization: key }, 3600);
  const clips = ((data.videos as unknown[]) || []).map(simplifyPexels).filter((c): c is Clip => !!c);
  return { clips, more: Boolean(data.next_page) };
}

async function pixabaySearch(query: string, orientation: string, page: number, perPage: number, key = apiKey('pixabay')) {
  const per = Math.max(3, perPage);
  const params = new URLSearchParams({ key, q: query.slice(0, 100), page: String(page), per_page: String(per), video_type: 'film', safesearch: 'true' });
  const data = await fetchJson(`https://pixabay.com/api/videos/?${params}`, {}, 86400);
  let clips = ((data.hits as unknown[]) || []).map(simplifyPixabay).filter((c): c is Clip => !!c);
  // L'API vidéo de Pixabay ne filtre pas l'orientation : on le fait ici.
  if (orientation === 'portrait') clips = clips.filter((c) => c.h > c.w);
  else if (orientation === 'landscape') clips = clips.filter((c) => c.w >= c.h);
  return { clips, more: page * per < Math.min(500, Number(data.totalHits) || 0) };
}

function durOk(d: number, f: string) {
  if (f === 'short') return d < 8;
  if (f === 'mid') return d >= 8 && d <= 15;
  if (f === 'long') return d > 15;
  return true;
}

/** Mélange les résultats de plusieurs recherches, sans doublons, filtrés par durée. */
export async function bank(queries: string[], orientation: string, dur: string, page: number) {
  const prov = provider();
  if (!prov) throw new BankError('Clé manquante', 401, true);
  const search = prov === 'pexels' ? pexelsSearch : pixabaySearch;
  const per = Math.max(8, Math.floor(30 / queries.length));
  const results = await Promise.all(queries.map((q) => search(q, orientation, page, per)));
  const seen = new Set<string>();
  const out: Clip[] = [];
  const longest = Math.max(0, ...results.map((r) => r.clips.length));
  for (let k = 0; k < longest; k++) {
    for (const { clips } of results) {
      const c = clips[k];
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        if (durOk(c.duration, dur)) out.push(c);
      }
    }
  }
  return { clips: out, page, has_more: results.some((r) => r.more), provider: prov };
}

/** Relais des vidéos de la banque (même origine que le site, lecture partielle possible pour les aperçus). */
export async function proxyClip(target: string, range: string | null) {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return Response.json({ detail: 'Adresse non autorisée' }, { status: 400 });
  }
  if (u.protocol !== 'https:' || !(u.hostname.endsWith('.pexels.com') || ['cdn.pixabay.com', 'pixabay.com'].includes(u.hostname))) {
    return Response.json({ detail: 'Adresse non autorisée' }, { status: 400 });
  }
  const r = await fetch(u, { headers: { 'User-Agent': 'SYNCOPE/1.0', ...(range ? { Range: range } : {}) } });
  if (!r.ok) return Response.json({ detail: `Clip indisponible (${r.status})` }, { status: 502 });
  const headers = new Headers({ 'Cache-Control': 'private, max-age=86400' });
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(r.body, { status: r.status, headers });
}
