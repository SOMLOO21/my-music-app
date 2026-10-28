export type Platform = {
  key: string;
  name: string;
  color: string;
  icon: string; // slug simpleicons.org
  cta: string;
  event: string; // nom de l'événement Meta envoyé au clic
};

// L'ordre ici = l'ordre d'affichage par défaut sur la page publique
export const PLATFORMS: Platform[] = [
  { key: 'spotify', name: 'Spotify', color: '#1DB954', icon: 'spotify', cta: 'Écouter', event: 'Click_Spotify' },
  { key: 'appleMusic', name: 'Apple Music', color: '#FA243C', icon: 'applemusic', cta: 'Écouter', event: 'Click_AppleMusic' },
  { key: 'deezer', name: 'Deezer', color: '#A238FF', icon: 'deezer', cta: 'Écouter', event: 'Click_Deezer' },
];

export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]));

export type LinkPlatform = { key: string; url: string };

export function parsePlatforms(s: string | null): LinkPlatform[] {
  try {
    const arr = JSON.parse(s || '[]');
    return Array.isArray(arr) ? arr.filter((p) => PLATFORM_BY_KEY[p.key] && p.url) : [];
  } catch {
    return [];
  }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function iconTile(p: Platform, size = 40) {
  // Logo blanc sur fond couleur de marque ; si l'icône ne charge pas, on affiche l'initiale
  return `<span class="tile" style="background:${p.color};width:${size}px;height:${size}px"><img src="https://cdn.simpleicons.org/${p.icon}/ffffff" alt="" width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('${p.name[0]}'))"></span>`;
}
