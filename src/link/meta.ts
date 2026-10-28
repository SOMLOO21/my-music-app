import type { Env, User } from './types';

// Le consentement est stocké dans ce cookie par la bannière de la page publique.
// Sans consentement explicite : ni pixel, ni Conversions API (RGPD / CNIL).
export const CONSENT_COOKIE = 'mml_consent';

export function hasConsent(cookieHeader: string | undefined | null) {
  return /(?:^|;\s*)mml_consent=granted/.test(cookieHeader || '');
}

function readCookie(cookieHeader: string | null, name: string) {
  const m = (cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** IP du fan (Vercel la place en tête de x-forwarded-for). */
export function clientIp(req: Request) {
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || undefined;
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type CapiEvent = {
  eventName: string;
  eventId: string;
  sourceUrl: string;
  customData?: Record<string, unknown>;
  fbp?: string;
  fbc?: string;
};

/**
 * Envoie un événement serveur à Meta (Conversions API).
 * Le même event_id est envoyé par le pixel navigateur → Meta dédoublonne.
 */
export async function sendCapi(env: Env, user: Pick<User, 'pixel_id' | 'capi_token' | 'test_event_code'>, req: Request, ev: CapiEvent) {
  if (!user.pixel_id || !user.capi_token) return { skipped: true };
  const cookies = req.headers.get('cookie');
  const country = req.headers.get('x-vercel-ip-country') || undefined;
  const userData: Record<string, unknown> = {
    client_ip_address: clientIp(req),
    client_user_agent: req.headers.get('user-agent') || undefined,
    fbp: ev.fbp || readCookie(cookies, '_fbp'),
    fbc: ev.fbc || readCookie(cookies, '_fbc'),
  };
  if (country && country !== 'XX') userData.country = [await sha256(country)];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        event_source_url: ev.sourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: ev.customData,
      },
    ],
  };
  if (user.test_event_code) body.test_event_code = user.test_event_code;

  const url = `https://graph.facebook.com/${env.META_API_VERSION}/${encodeURIComponent(user.pixel_id)}/events?access_token=${encodeURIComponent(user.capi_token)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) console.error('CAPI error', res.status, await res.text());
  return { ok: res.ok };
}
