// Retrouve une sortie sur toutes les plateformes à partir d'un seul lien (ou d'un ISRC / UPC).
// Sources : page publique Spotify (+ API Spotify si configurée), API publique Deezer, API iTunes (Apple Music).
// On recoupe par ISRC (titre) / UPC (album) quand on les a, sinon par recherche artiste + titre.
import { appToken } from './spotify';
import type { Env } from './types';
import type { LinkPlatform } from './platforms';

type Kind = 'track' | 'album';
type Release = { kind: Kind; title: string; artist: string; artwork?: string; isrc?: string; upc?: string };
type Found = { url: string; release: Partial<Release> };

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MyMusicLink/1.0)' };
const getJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return (await res.json()) as any;
};
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\..*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Titre sans "(Radio Edit)", "[feat. …]" etc. pour les recherches plein texte
const cleanTitle = (s: string) => s.replace(/\(.*?\)|\[.*?\]|\s[-–]\s.*$|feat\..*$/gi, '').trim() || s;
const mainArtist = (s: string) => s.split(/,|&| feat\.| x /i)[0].trim();
const sameRelease = (a: string, b: string) => norm(a).includes(norm(cleanTitle(b))) || norm(b).includes(norm(cleanTitle(a)));
const sameTitle = (a: string, b: string) => norm(cleanTitle(a)) === norm(cleanTitle(b));
const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ───────── Spotify ─────────
async function spotifyFromUrl(env: Env, kind: Kind, id: string): Promise<Found> {
  const url = `https://open.spotify.com/${kind}/${id}`;
  if (env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET) {
    try {
      const { access_token } = await appToken(env);
      const d = await getJson(`https://api.spotify.com/v1/${kind}s/${id}`, { headers: { authorization: `Bearer ${access_token}` } });
      const images = kind === 'track' ? d.album?.images : d.images;
      return {
        url,
        release: { kind, title: d.name, artist: d.artists?.map((a: any) => a.name).join(', '), artwork: images?.[0]?.url, isrc: d.external_ids?.isrc, upc: d.external_ids?.upc },
      };
    } catch {
      /* repli sur la page publique */
    }
  }
  const page = await (await fetch(url, { headers: UA })).text();
  const meta = (p: string) => page.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`))?.[1];
  const title = meta('og:title');
  if (!title) throw new Error('Titre Spotify introuvable');
  const artist = decodeEntities(meta('music:musician_description') || meta('og:description')?.split(' · ')[0] || '');
  return { url, release: { kind, title: parseSpotifyTitle(decodeEntities(title), artist), artist, artwork: meta('og:image') } };
}

// "Listen to CARNAGE - Single by Seizar | Spotify" → "CARNAGE"
function parseSpotifyTitle(t: string, artist: string) {
  t = t.replace(/^Listen to /i, '').replace(/\s*\|\s*Spotify$/i, '');
  if (artist && t.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) t = t.slice(0, -(artist.length + 4));
  return t.replace(/\s+-\s+(Single|EP|Album|Compilation|song(?: and lyrics)?)$/i, '').trim();
}

async function spotifySearch(env: Env, r: Release): Promise<Found | null> {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  const { access_token } = await appToken(env);
  const t = cleanTitle(r.title), a = mainArtist(r.artist);
  const q = r.kind === 'track' ? (r.isrc ? `isrc:${r.isrc}` : `track:${t} artist:${a}`) : r.upc ? `upc:${r.upc}` : `album:${t} artist:${a}`;
  const d = await getJson(`https://api.spotify.com/v1/search?type=${r.kind}&limit=1&q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${access_token}` } });
  const item = d[`${r.kind}s`]?.items?.[0];
  return item ? { url: item.external_urls.spotify, release: { artwork: (r.kind === 'track' ? item.album : item).images?.[0]?.url } } : null;
}

// ───────── Deezer ─────────
async function deezerById(kind: Kind, id: string): Promise<Found> {
  const d = await getJson(`https://api.deezer.com/${kind}/${id}`);
  if (d.error) throw new Error('Introuvable sur Deezer');
  let upc = d.upc as string | undefined;
  if (kind === 'track' && d.album?.id) upc = (await getJson(`https://api.deezer.com/album/${d.album.id}`).catch(() => ({}))).upc;
  return {
    url: d.link,
    release: { kind, title: d.title, artist: d.artist?.name, artwork: (d.album || d).cover_xl, isrc: d.isrc, upc },
  };
}

async function deezerSearch(r: Release): Promise<Found | null> {
  if (r.kind === 'track' && r.isrc) {
    const d = await getJson(`https://api.deezer.com/track/isrc:${r.isrc}`);
    if (!d.error) return deezerById('track', d.id);
  }
  if (r.kind === 'album' && r.upc) {
    const d = await getJson(`https://api.deezer.com/album/upc:${r.upc}`);
    if (!d.error) return deezerById('album', d.id);
  }
  const d = await getJson(`https://api.deezer.com/search/${r.kind}?limit=10&q=${encodeURIComponent(`${mainArtist(r.artist)} ${cleanTitle(r.title)}`)}`);
  const artist = norm(mainArtist(r.artist));
  const hit = (d.data || []).find((x: any) => sameRelease(x.title, r.title) && norm(x.artist?.name || '').includes(artist));
  return hit ? deezerById(r.kind, hit.id) : deezerCatalog(r);
}

// Les sorties du jour ne sont pas encore dans l'index de recherche Deezer, mais elles sont déjà dans la discographie de l'artiste
async function deezerCatalog(r: Release): Promise<Found | null> {
  const name = mainArtist(r.artist);
  const a = await getJson(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
  const artist = (a.data || []).find((x: any) => norm(x.name) === norm(name));
  if (!artist) return null;
  const albums = await getJson(`https://api.deezer.com/artist/${artist.id}/albums?limit=200`);
  const album = (albums.data || []).find((x: any) => sameTitle(x.title, r.title));
  if (album && r.kind === 'album') return deezerById('album', album.id);
  if (album) {
    const tracks = await getJson(`https://api.deezer.com/album/${album.id}/tracks`);
    const t = (tracks.data || []).find((x: any) => sameTitle(x.title, r.title));
    if (t) return deezerById('track', t.id);
  }
  if (r.kind === 'track') {
    const top = await getJson(`https://api.deezer.com/artist/${artist.id}/top?limit=100`);
    const t = (top.data || []).find((x: any) => sameTitle(x.title, r.title));
    if (t) return deezerById('track', t.id);
  }
  return null;
}

// ───────── Apple Music (API iTunes) ─────────
const bigArtwork = (u?: string) => u?.replace(/\/\d+x\d+bb\./, '/1000x1000bb.');
const cleanAppleUrl = (u: string) => u.replace(/[?&]uo=\d+/, '').replace(/\?$/, '');

async function appleById(kind: Kind, id: string): Promise<Found> {
  const d = await getJson(`https://itunes.apple.com/lookup?country=fr&id=${id}`);
  const x = d.results?.[0];
  if (!x) throw new Error('Introuvable sur Apple Music');
  return {
    url: cleanAppleUrl(kind === 'track' ? x.trackViewUrl : x.collectionViewUrl),
    release: { kind, title: kind === 'track' ? x.trackName : x.collectionName, artist: x.artistName, artwork: bigArtwork(x.artworkUrl100) },
  };
}

async function appleSearch(r: Release): Promise<Found | null> {
  if (r.kind === 'album' && r.upc) {
    const d = await getJson(`https://itunes.apple.com/lookup?country=fr&upc=${r.upc}`);
    const x = d.results?.[0];
    if (x) return { url: cleanAppleUrl(x.collectionViewUrl), release: { artwork: bigArtwork(x.artworkUrl100) } };
  }
  const entity = r.kind === 'track' ? 'song' : 'album';
  const d = await getJson(`https://itunes.apple.com/search?country=fr&limit=10&entity=${entity}&term=${encodeURIComponent(`${mainArtist(r.artist)} ${cleanTitle(r.title)}`)}`);
  const artist = norm(mainArtist(r.artist));
  const hit = (d.results || []).find(
    (x: any) => sameRelease(r.kind === 'track' ? x.trackName : x.collectionName, r.title) && norm(x.artistName).includes(artist),
  );
  if (!hit) return appleCatalog(r);
  return { url: cleanAppleUrl(r.kind === 'track' ? hit.trackViewUrl : hit.collectionViewUrl), release: { artwork: bigArtwork(hit.artworkUrl100) } };
}

async function appleCatalog(r: Release): Promise<Found | null> {
  const name = mainArtist(r.artist);
  const a = await getJson(`https://itunes.apple.com/search?country=fr&entity=musicArtist&limit=10&term=${encodeURIComponent(name)}`);
  const artist = (a.results || []).find((x: any) => norm(x.artistName) === norm(name));
  if (!artist) return null;
  const entity = r.kind === 'track' ? 'song' : 'album';
  const d = await getJson(`https://itunes.apple.com/lookup?country=fr&id=${artist.artistId}&entity=${entity}&limit=200&sort=recent`);
  const hit = (d.results || []).find(
    (x: any) => x.wrapperType !== 'artist' && sameTitle(r.kind === 'track' ? x.trackName : x.collectionName, r.title),
  );
  if (!hit) return null;
  return { url: cleanAppleUrl(r.kind === 'track' ? hit.trackViewUrl : hit.collectionViewUrl), release: { artwork: bigArtwork(hit.artworkUrl100) } };
}

// ───────── Point d'entrée ─────────
async function identify(env: Env, input: string): Promise<{ source: string; found: Found } | { release: Release }> {
  const s = input.trim();
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(s)) {
    const d = await getJson(`https://api.deezer.com/track/isrc:${s.toUpperCase()}`);
    if (d.error) throw new Error('ISRC introuvable');
    return { source: 'deezer', found: await deezerById('track', d.id) };
  }
  if (/^\d{12,14}$/.test(s)) {
    const d = await getJson(`https://api.deezer.com/album/upc:${s}`);
    if (d.error) throw new Error('UPC introuvable (le titre n’est peut-être pas encore en ligne)');
    return { source: 'deezer', found: await deezerById('album', d.id) };
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error('Colle un lien complet (https://…), un ISRC ou un UPC');
  }
  // Liens courts Deezer (link.deezer.com, deezer.page.link) : on suit la redirection
  if (/link\.deezer\.com|deezer\.page\.link/.test(url.hostname)) url = new URL((await fetch(url, { headers: UA })).url);

  const sp = url.href.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album)\/([A-Za-z0-9]+)/);
  if (sp) return { source: 'spotify', found: await spotifyFromUrl(env, sp[1] as Kind, sp[2]) };

  const dz = url.href.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album)\/(\d+)/);
  if (dz) return { source: 'deezer', found: await deezerById(dz[1] as Kind, dz[2]) };

  if (/music\.apple\.com|itunes\.apple\.com/.test(url.hostname)) {
    const trackId = url.searchParams.get('i') || url.pathname.match(/\/song\/[^/]+\/(\d+)/)?.[1];
    if (trackId) return { source: 'appleMusic', found: await appleById('track', trackId) };
    const albumId = url.pathname.match(/\/album\/(?:[^/]+\/)?(\d+)/)?.[1];
    if (albumId) return { source: 'appleMusic', found: await appleById('album', albumId) };
  }
  throw new Error('Lien non reconnu : utilise un lien Spotify, Deezer ou Apple Music (titre ou album)');
}

export async function resolveRelease(env: Env, input: string) {
  const id = await identify(env, input);
  if (!('found' in id)) throw new Error('Lien non reconnu');
  const release = id.found.release as Release;
  const links: Record<string, Found | null> = { [id.source]: id.found };

  // Deezer d'abord : c'est lui qui donne l'ISRC/UPC quand la source ne les a pas
  if (!links.deezer) {
    links.deezer = await deezerSearch(release).catch(() => null);
    if (links.deezer) {
      release.isrc ||= links.deezer.release.isrc;
      release.upc ||= links.deezer.release.upc;
    }
  }
  const [spotify, apple] = await Promise.all([
    links.spotify ? links.spotify : spotifySearch(env, release).catch(() => null),
    links.appleMusic ? links.appleMusic : appleSearch(release).catch(() => null),
  ]);
  links.spotify = spotify;
  links.appleMusic = apple;

  const platforms: LinkPlatform[] = ['spotify', 'appleMusic', 'deezer']
    .filter((k) => links[k]?.url)
    .map((k) => ({ key: k, url: links[k]!.url }));

  return {
    title: release.title,
    artist: release.artist,
    artwork_url: links.spotify?.release.artwork || links.appleMusic?.release.artwork || links.deezer?.release.artwork || release.artwork || '',
    platforms,
  };
}
