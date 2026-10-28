// Détection et regroupement des sources d'ouverture d'un smart link.

const SEARCH = /(^|\.)(google|bing|duckduckgo|qwant|ecosia|yahoo|search\.brave|startpage|yandex)\./;

/** Valeur brute stockée en base (une par vue / clic). */
export function detectSource(url: URL, referer: string | undefined, ua: string) {
  const utm = url.searchParams.get('utm_source');
  if (utm) return normalizeUtm(utm);
  if (url.searchParams.get('fbclid')) return 'meta_ads';
  if (url.searchParams.get('gclid')) return 'google_ads';
  if (url.searchParams.get('ttclid')) return 'tiktok_ads';

  if (referer) {
    try {
      const host = new URL(referer).hostname.replace(/^(www|m|l|lm)\./, '');
      if (host !== url.hostname) {
        if (/instagram/.test(host)) return 'instagram';
        if (/facebook|fb\.com|fb\.me/.test(host)) return 'facebook';
        if (/tiktok/.test(host)) return 'tiktok';
        if (/youtube|youtu\.be/.test(host)) return 'youtube';
        if (SEARCH.test(host)) return host.match(SEARCH)![2].replace('search.', '');
        if (/^t\.co$|twitter|^x\.com$/.test(host)) return 'x';
        if (/snapchat/.test(host)) return 'snapchat';
        if (/threads\.net/.test(host)) return 'threads';
        if (/linkedin|lnkd\.in/.test(host)) return 'linkedin';
        return host.slice(0, 40);
      }
    } catch {
      /* référent illisible */
    }
  }
  // Les navigateurs intégrés aux apps n'envoient souvent pas de référent : on les reconnaît à leur user-agent
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  return 'direct';
}

function normalizeUtm(v: string) {
  const s = v.toLowerCase().trim().slice(0, 40);
  if (/^(ig|insta|instagram)/.test(s)) return 'instagram';
  if (/^(fb|facebook)/.test(s)) return 'facebook';
  if (/^(meta|meta_ads|facebook_ads)$/.test(s)) return 'meta_ads';
  if (/^(tt|tiktok)/.test(s)) return 'tiktok';
  if (/^(yt|youtube)/.test(s)) return 'youtube';
  return s;
}

/** Catégories affichées dans les stats — ordre fixe = couleur fixe (validée daltonisme). */
export const SOURCE_GROUPS = [
  { key: 'meta_ads', label: 'Pub Meta', color: '#2a78d6' },
  { key: 'instagram', label: 'Instagram', color: '#eb6834' },
  { key: 'facebook', label: 'Facebook', color: '#1baf7a' },
  { key: 'tiktok', label: 'TikTok', color: '#eda100' },
  { key: 'search', label: 'Recherche Google…', color: '#e87ba4' },
  { key: 'youtube', label: 'YouTube', color: '#008300' },
  { key: 'social', label: 'Autres réseaux', color: '#6250d6' },
  { key: 'external', label: 'Sites externes', color: '#e34948' },
  { key: 'direct', label: 'Direct / inconnu', color: '#9ca3af' },
] as const;

export function sourceGroup(raw: string | null): (typeof SOURCE_GROUPS)[number]['key'] {
  const s = (raw || 'direct').toLowerCase();
  if (s === 'meta_ads' || s === 'meta (pub)') return 'meta_ads';
  if (s === 'instagram') return 'instagram';
  if (s === 'facebook') return 'facebook';
  if (s === 'tiktok' || s === 'tiktok_ads') return 'tiktok';
  if (s === 'google_ads' || /^(google|bing|duckduckgo|qwant|ecosia|yahoo|brave|startpage|yandex)$/.test(s)) return 'search';
  if (s === 'youtube') return 'youtube';
  if (/^(x|x \/ twitter|twitter|snapchat|threads|linkedin)$/.test(s)) return 'social';
  if (s === 'direct') return 'direct';
  return 'external';
}
