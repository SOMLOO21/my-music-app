// Liens personnalisés ajoutés par l'artiste en plus des plateformes de streaming.

export type CustomLink = { id: string; title: string; url: string; icon: string };

export const MAX_CUSTOM_LINKS = 12;
const ICON_PATH = /^\/l\/media\/[a-f0-9]{16,40}$/;

export function sanitizeCustomLinks(rows: Partial<CustomLink>[]): CustomLink[] {
  return rows
    .map((r) => ({
      id: /^[a-z0-9]{6,32}$/.test(String(r.id || '')) ? String(r.id) : crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      title: String(r.title || '').trim().slice(0, 60),
      url: String(r.url || '').trim(),
      icon: ICON_PATH.test(String(r.icon || '')) && !String(r.icon).includes('..') ? String(r.icon) : '',
    }))
    .filter((r) => r.title || r.url)
    .slice(0, MAX_CUSTOM_LINKS);
}

export function parseCustomLinks(json: string | null | undefined): CustomLink[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? sanitizeCustomLinks(arr).filter((l) => l.title && /^https?:\/\//.test(l.url)) : [];
  } catch {
    return [];
  }
}

/** Clé stockée dans events.platform pour un clic sur un lien personnalisé. */
export const customKey = (id: string) => `custom:${id}`;
