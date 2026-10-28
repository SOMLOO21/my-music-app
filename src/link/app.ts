// My Music Link : smart links avec pixel Meta + Conversions API, intégré à My Music App.
// - /link/…  espace artiste (compte My Music App obligatoire)
// - /l/…     pages publiques des smart links, redirections, images
// Monté dans Next.js par src/app/link/[[...path]]/route.ts et src/app/l/[...path]/route.ts.
import { Hono, type Context } from 'hono';
import { after } from 'next/server';
import { currentUser } from '@/lib/accounts';
import { sql } from '@/lib/sql';
import { hasConsent, sendCapi } from './meta';
import { PLATFORMS, PLATFORM_BY_KEY, parsePlatforms } from './platforms';
import { resolveRelease } from './resolver';
import { appUrl } from './spotify';
import { env, type Link, type User } from './types';
import { dashboard, editor, emptyForm, landing, linkToForm, settingsPage, type LinkForm, type LinkSummary } from './views/app';
import { globalStatsPage, type GlobalStats, type LinkRow } from './views/stats';
import { detectSource, sourceGroup } from './sources';
import { publicPage } from './views/public';
import { sanitizeTheme } from './theme';
import { customKey, parseCustomLinks, sanitizeCustomLinks } from './custom-links';
import { h, layout } from './html';

type AppEnv = { Variables: { user: User } };
type Owner = Pick<User, 'pixel_id' | 'capi_token' | 'test_event_code'>;

const app = new Hono<AppEnv>();
const db = sql;
// Sous-chemins de /l/ qui ne peuvent pas servir d'adresse de smart link
const RESERVED = new Set(['go', 't', 'media', 'admin', 'api', 'link', 'compte', 'inspire']);
const BOT_UA = /bot|crawler|spider|facebookexternalhit|meta-externalagent|preview|slurp|whatsapp|telegram/i;
const html = (c: Context, page: unknown, status = 200) => c.html(String(page), status as 200);
const newId = () => crypto.randomUUID().replace(/-/g, '');
/** Travail lancé après l'envoi de la réponse (statistiques, Conversions API) : la redirection reste instantanée. */
const later = (p: Promise<unknown>) => after(p.catch((e) => console.error('[link]', e)));

// ───────────── Espace artiste ─────────────
async function loadUser(): Promise<User | null> {
  const u = await currentUser();
  if (!u) return null;
  const s = await db
    .prepare('SELECT pixel_id, capi_token, test_event_code FROM ml_settings WHERE user_id = ?')
    .bind(u.id)
    .first<Owner>();
  return { id: u.id, name: u.firstName, pseudo: u.pseudo, pixel_id: s?.pixel_id ?? null, capi_token: s?.capi_token ?? null, test_event_code: s?.test_event_code ?? null };
}

// Sans compte : page de présentation, qui renvoie vers la connexion My Music App
app.get('/link', async (c) => {
  const user = await loadUser();
  if (!user) return html(c, landing());
  const { results } = await db
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM ml_events e WHERE e.link_id = l.id AND e.type = 'view') AS views,
        (SELECT COUNT(*) FROM ml_events e WHERE e.link_id = l.id AND e.type = 'click') AS clicks
       FROM ml_links l WHERE l.user_id = ? ORDER BY l.created_at DESC`,
    )
    .bind(user.id)
    .all<LinkSummary>();
  return html(c, dashboard(user, results, appUrl(c.req.raw)));
});

app.use('/link/*', async (c, next) => {
  const user = await loadUser();
  if (!user) return c.redirect('/compte');
  c.set('user', user);
  await next();
});

app.get('/link/new', (c) => html(c, editor(c.get('user'), emptyForm(), appUrl(c.req.raw))));

app.post('/link/import', async (c) => {
  const user = c.get('user');
  const url = String((await c.req.parseBody()).url || '').trim();
  const base = appUrl(c.req.raw);
  try {
    const data = await resolveRelease(env, url);
    const f = emptyForm();
    Object.assign(f, { title: data.title, artist: data.artist, artwork_url: data.artwork_url });
    for (const p of data.platforms) f.platforms[p.key] = p.url;
    f.slug = await uniqueSlug(slugify(`${data.artist}-${data.title}`));
    return html(c, editor(user, f, base, { msg: { ok: `Trouvé sur ${data.platforms.length}/3 plateformes. Vérifie et enregistre.` } }));
  } catch (e) {
    return html(c, editor(user, emptyForm(), base, { msg: { err: `Import impossible : ${(e as Error).message}` } }), 400);
  }
});

app.post('/link/links', async (c) => saveLink(c, null));

// Aperçu en direct de l'éditeur : rend la page publique à partir du formulaire, sans rien enregistrer
app.post('/link/preview', async (c) => {
  const f = readForm(await c.req.parseBody({ all: true }));
  const link: Link = {
    id: 'preview', user_id: c.get('user').id, slug: f.slug || 'apercu',
    title: f.title || 'Titre', artist: f.artist || 'Artiste',
    artwork_url: /^https:\/\//.test(f.artwork_url) ? f.artwork_url : null,
    accent: f.accent, theme: JSON.stringify(f.theme), custom_links: JSON.stringify(f.customLinks.filter((l) => l.title && /^https?:\/\//.test(l.url))),
    platforms: JSON.stringify(PLATFORMS.filter((p) => f.platforms[p.key]).map((p) => ({ key: p.key, url: f.platforms[p.key] }))),
    created_at: Date.now(),
  };
  return html(c, publicPage(link, { pixelId: null, source: 'preview', appName: env.APP_NAME, preview: true }));
});

app.get('/link/links/:id', async (c) => {
  const link = await ownLink(c);
  if (!link) return c.notFound();
  return html(c, editor(c.get('user'), linkToForm(link), appUrl(c.req.raw)));
});

app.post('/link/links/:id', async (c) => {
  const link = await ownLink(c);
  if (!link) return c.notFound();
  return saveLink(c, link);
});

app.post('/link/links/:id/delete', async (c) => {
  const link = await ownLink(c);
  if (!link) return c.notFound();
  await db.batch([
    db.prepare('DELETE FROM ml_events WHERE link_id = ?').bind(link.id),
    db.prepare('DELETE FROM ml_links WHERE id = ?').bind(link.id),
  ]);
  return c.redirect('/link');
});

app.get('/link/links/:id/stats', (c) => c.redirect(`/link/stats?link=${c.req.param('id')}`));

app.get('/link/stats', async (c) => {
  const user = c.get('user');
  const days = [7, 30, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30;
  const { results: allLinks } = await db
    .prepare('SELECT id, title, artist FROM ml_links WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all<{ id: string; title: string; artist: string }>();
  const linkId = allLinks.some((l) => l.id === c.req.query('link')) ? c.req.query('link')! : 'all';
  return html(c, globalStatsPage(user, await loadStats(user.id, linkId, days), { days, linkId, allLinks }));
});

app.get('/link/settings', (c) => html(c, settingsPage(c.get('user'))));
app.post('/link/settings', async (c) => {
  const user = c.get('user');
  const b = await c.req.parseBody();
  const pixel = String(b.pixel_id || '').trim();
  if (pixel && !/^\d{8,20}$/.test(pixel)) return html(c, settingsPage(user, { err: "L'ID du pixel ne contient que des chiffres." }), 400);
  const token = String(b.capi_token || '').trim() || null;
  const testCode = String(b.test_event_code || '').trim() || null;
  await db
    .prepare(
      `INSERT INTO ml_settings (user_id, pixel_id, capi_token, test_event_code) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET pixel_id = excluded.pixel_id, capi_token = excluded.capi_token, test_event_code = excluded.test_event_code`,
    )
    .bind(user.id, pixel || null, token, testCode)
    .run();
  const fresh = { ...user, pixel_id: pixel || null, capi_token: token, test_event_code: testCode };
  return html(c, settingsPage(fresh, { ok: 'Pixel enregistré. Ouvre un de tes liens et vérifie les événements dans Meta.' }));
});

// ───────────── Images importées (stockées dans la base Turso) ─────────────
// Les images sont compressées dans le navigateur avant l'envoi ; Vercel limite les requêtes à 4,5 Mo.
const MAX_UPLOAD = 3 * 1024 * 1024;
// On se fie au contenu réel du fichier, pas à l'extension (pas de SVG : il peut contenir du script)
function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (String.fromCharCode(...b.slice(4, 12)) === 'ftypavif') return 'image/avif';
  return null;
}

app.post('/link/upload', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'Aucun fichier reçu.' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'Image trop lourde (3 Mo maximum après compression).' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return c.json({ error: 'Formats acceptés : JPG, PNG, WebP, AVIF.' }, 415);
  const id = newId();
  await db
    .prepare('INSERT INTO ml_media (id, user_id, kind, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, body.kind === 'icon' ? 'icon' : 'bg', type, bytes, Date.now())
    .run();
  return c.json({ url: `/l/media/${id}` });
});

app.get('/l/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[a-f0-9]{16,40}$/.test(id)) return c.notFound();
  const row = await db.prepare('SELECT content_type, data FROM ml_media WHERE id = ?').bind(id).first<{ content_type: string; data: ArrayBuffer }>();
  if (!row) return c.notFound();
  return new Response(new Uint8Array(row.data), {
    headers: {
      'content-type': row.content_type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
});

// ───────────── Tracking ─────────────
app.post('/l/t', async (c) => {
  if (!hasConsent(c.req.header('cookie'))) return c.body(null, 204);
  const b = await c.req.json<{ slug: string; event: string; eventId: string; url: string; fbp?: string; fbc?: string }>().catch(() => null);
  if (!b || b.event !== 'PageView' || !b.eventId) return c.body(null, 400);
  const row = await linkWithOwner(String(b.slug));
  if (row) {
    later(
      sendCapi(env, row.owner, c.req.raw, { eventName: 'PageView', eventId: b.eventId, sourceUrl: b.url, fbp: b.fbp || undefined, fbc: b.fbc || undefined, customData: { content_name: row.link.title } }),
    );
  }
  return c.body(null, 204);
});

app.get('/l/go/:slug/:platform', async (c) => {
  const row = await linkWithOwner(c.req.param('slug'));
  if (!row) return c.redirect('/');
  const param = c.req.param('platform');
  let target: { url: string; key: string; event: string; label: string } | null = null;
  if (param.startsWith('c-')) {
    const cl = parseCustomLinks(row.link.custom_links).find((l) => l.id === param.slice(2));
    if (cl) target = { url: cl.url, key: customKey(cl.id), event: 'Click_Custom', label: cl.title };
  } else {
    const platform = PLATFORM_BY_KEY[param];
    const p = platform && parsePlatforms(row.link.platforms).find((x) => x.key === platform.key);
    if (p) target = { url: p.url, key: platform.key, event: platform.event, label: platform.name };
  }
  if (!target) return c.redirect(`/l/${row.link.slug}`);
  const t = target;

  const eid = c.req.query('eid');
  if (!BOT_UA.test(c.req.header('user-agent') || '')) later(logEvent(c, row.link.id, 'click', t.key, c.req.query('s')));
  if (eid && hasConsent(c.req.header('cookie'))) {
    later(
      sendCapi(env, row.owner, c.req.raw, {
        eventName: t.event,
        eventId: eid,
        sourceUrl: `${appUrl(c.req.raw)}/l/${row.link.slug}`,
        fbp: c.req.query('fbp'),
        customData: { platform: t.key, link_title: t.label, content_name: `${row.link.artist} - ${row.link.title}` },
      }),
    );
  }
  c.header('cache-control', 'no-store');
  return c.redirect(t.url, 302);
});

// ───────────── Smart link public ─────────────
app.get('/l/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if (RESERVED.has(slug)) return c.notFound();
  const row = await linkWithOwner(slug);
  if (!row) return c.notFound();

  const source = detectSource(new URL(c.req.url), c.req.header('referer'), c.req.header('user-agent') || '');
  if (!BOT_UA.test(c.req.header('user-agent') || '')) later(logEvent(c, row.link.id, 'view', null, source));
  c.header('cache-control', 'no-store');
  return html(c, publicPage(row.link, { pixelId: row.owner.pixel_id, source, appName: env.APP_NAME }));
});

app.notFound((c) =>
  html(
    c,
    layout({
      title: 'Introuvable',
      body: h`<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px"><div><h1 style="font-size:28px">Ce lien n'existe pas</h1><p class="muted">Vérifie l'adresse ou demande le bon lien à l'artiste.</p><a class="btn" href="/">My Music App</a></div></main>`,
    }),
    404,
  ),
);

// ───────────── Helpers ─────────────
async function ownLink(c: Context<AppEnv>) {
  return db.prepare('SELECT * FROM ml_links WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('user').id).first<Link>();
}

async function linkWithOwner(slug: string) {
  const link = await db.prepare('SELECT * FROM ml_links WHERE slug = ?').bind(slug).first<Link>();
  if (!link) return null;
  const owner = await db.prepare('SELECT pixel_id, capi_token, test_event_code FROM ml_settings WHERE user_id = ?').bind(link.user_id).first<Owner>();
  return { link, owner: owner ?? { pixel_id: null, capi_token: null, test_event_code: null } };
}

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'mon-lien';

async function uniqueSlug(base: string) {
  let slug = base.length < 3 ? `${base}-link` : base;
  for (let i = 2; (await db.prepare('SELECT 1 FROM ml_links WHERE slug = ?').bind(slug).first()) || RESERVED.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function readForm(b: Record<string, unknown>, id?: string): LinkForm {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const s = (k: string) => String(first(b[k]) ?? '').trim();
  const list = (k: string) => (b[k] === undefined ? [] : Array.isArray(b[k]) ? (b[k] as unknown[]) : [b[k]]).map((v) => String(v));
  const titles = list('c_title'), urls = list('c_url'), icons = list('c_icon'), ids = list('c_id');
  return {
    id,
    slug: s('slug').toLowerCase(),
    title: s('title'),
    artist: s('artist'),
    artwork_url: s('artwork_url'),
    accent: /^#[0-9a-f]{6}$/i.test(s('accent')) ? s('accent') : '#111827',
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p.key, s(`p_${p.key}`)])),
    theme: sanitizeTheme(Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith('t_')).map(([k, v]) => [k.slice(2), String(first(v))]))),
    customLinks: sanitizeCustomLinks(titles.map((title, i) => ({ id: ids[i], title, url: urls[i], icon: icons[i] }))),
  };
}

async function saveLink(c: Context<AppEnv>, existing: Link | null) {
  const user = c.get('user');
  const f = readForm(await c.req.parseBody({ all: true }), existing?.id);
  const base = appUrl(c.req.raw);
  const fail = (err: string) => html(c, editor(user, f, base, { msg: { err } }), 400);

  if (!f.title || !f.artist) return fail('Le titre et l’artiste sont obligatoires.');
  if (!/^[a-z0-9-]{3,60}$/.test(f.slug) || RESERVED.has(f.slug)) return fail('Adresse invalide : 3 à 60 caractères, minuscules, chiffres et tirets.');
  const taken = await db.prepare('SELECT id FROM ml_links WHERE slug = ?').bind(f.slug).first<{ id: string }>();
  if (taken && taken.id !== existing?.id) return fail('Cette adresse est déjà prise.');
  const badUrl = Object.entries(f.platforms).find(([, u]) => u && !/^https:\/\//.test(u));
  if (badUrl) return fail(`Le lien ${PLATFORM_BY_KEY[badUrl[0]].name} doit commencer par https://`);
  if (f.artwork_url && !/^https:\/\//.test(f.artwork_url)) return fail('L’URL de la pochette doit commencer par https://');
  const badCustom = f.customLinks.find((l) => !l.title || !/^https?:\/\/[^\s]+\.[^\s]+/.test(l.url));
  if (badCustom) return fail(`Lien « ${badCustom.title || badCustom.url} » : il faut un titre et une adresse complète (https://…).`);

  const platforms = PLATFORMS.filter((p) => f.platforms[p.key]).map((p) => ({ key: p.key, url: f.platforms[p.key] }));
  const values = [f.slug, f.title, f.artist, f.artwork_url || null, f.accent, JSON.stringify(f.theme), JSON.stringify(f.customLinks), JSON.stringify(platforms)];
  if (existing) {
    await db
      .prepare('UPDATE ml_links SET slug=?, title=?, artist=?, artwork_url=?, accent=?, theme=?, custom_links=?, platforms=? WHERE id=?')
      .bind(...values, existing.id)
      .run();
  } else {
    await db
      .prepare('INSERT INTO ml_links (slug, title, artist, artwork_url, accent, theme, custom_links, platforms, id, user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(...values, newId(), user.id, Date.now())
      .run();
  }
  return c.redirect('/link');
}

async function logEvent(c: Context<AppEnv>, linkId: string, type: string, platform: string | null, source?: string) {
  const ua = c.req.header('user-agent') || '';
  const device = /iphone|ipad|ipod/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'desktop';
  const country = c.req.header('x-vercel-ip-country') || null;
  await db
    .prepare('INSERT INTO ml_events (link_id, type, platform, country, source, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(linkId, type, platform, country, (source || 'direct').slice(0, 40), device, Date.now())
    .run();
}

async function loadStats(userId: string, linkId: string, days: number): Promise<GlobalStats> {
  const since = Date.now() - days * 86400_000;
  const one = linkId !== 'all';
  const scope = `FROM ml_events e JOIN ml_links l ON l.id = e.link_id WHERE l.user_id = ? AND e.created_at >= ?${one ? ' AND l.id = ?' : ''}`;
  const q = (query: string) => db.prepare(query).bind(...(one ? [userId, since, linkId] : [userId, since])).all<any>();
  const [totals, platforms, sources, daily, links] = await Promise.all([
    q(`SELECT e.type, COUNT(*) AS n ${scope} GROUP BY e.type`),
    q(`SELECT e.platform AS key, COUNT(*) AS n ${scope} AND e.type = 'click' GROUP BY e.platform`),
    q(`SELECT e.source, SUM(e.type = 'view') AS views, SUM(e.type = 'click') AS clicks ${scope} GROUP BY e.source`),
    q(`SELECT strftime('%Y-%m-%d', e.created_at / 1000, 'unixepoch') AS day, SUM(e.type = 'view') AS views, SUM(e.type = 'click') AS clicks ${scope} GROUP BY day`),
    db
      .prepare(
        `SELECT l.id, l.slug, l.title, l.artist, l.artwork_url,
          COALESCE(SUM(e.type = 'view'), 0) AS views,
          COALESCE(SUM(e.type = 'click'), 0) AS clicks,
          COALESCE(SUM(e.type = 'click' AND e.platform = 'spotify'), 0) AS spotify,
          COALESCE(SUM(e.type = 'click' AND e.platform = 'appleMusic'), 0) AS appleMusic,
          COALESCE(SUM(e.type = 'click' AND e.platform = 'deezer'), 0) AS deezer,
          COALESCE(SUM(e.type = 'click' AND e.platform LIKE 'custom:%'), 0) AS custom,
          l.custom_links
         FROM ml_links l LEFT JOIN ml_events e ON e.link_id = l.id AND e.created_at >= ?
         WHERE l.user_id = ?${one ? ' AND l.id = ?' : ''}
         GROUP BY l.id ORDER BY clicks DESC, views DESC`,
      )
      .bind(...(one ? [since, userId, linkId] : [since, userId]))
      .all<any>(),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  const t = Object.fromEntries(totals.results.map((r) => [r.type, num(r.n)]));

  // Liens personnalisés : une part « Autres liens » + le détail par titre
  const titles = new Map<string, { title: string; release: string }>();
  for (const l of links.results) for (const cl of parseCustomLinks(l.custom_links)) titles.set(customKey(cl.id), { title: cl.title, release: l.title });
  const customs = platforms.results
    .filter((r) => String(r.key).startsWith('custom:'))
    .map((r) => ({ title: titles.get(r.key)?.title ?? 'Lien supprimé', release: titles.get(r.key)?.release ?? '', n: num(r.n) }))
    .sort((a, b) => b.n - a.n);
  const platformRows = platforms.results.filter((r) => !String(r.key).startsWith('custom:')).map((r) => ({ key: String(r.key), n: num(r.n) }));
  if (customs.length) platformRows.push({ key: 'custom', n: customs.reduce((a, b) => a + b.n, 0) });

  // Regroupe les sources brutes (instagram, google, meta_ads, nom de domaine…) en catégories
  const grouped = new Map<string, { key: string; views: number; clicks: number }>();
  for (const r of sources.results) {
    const key = sourceGroup(r.source);
    const g = grouped.get(key) ?? { key, views: 0, clicks: 0 };
    g.views += num(r.views);
    g.clicks += num(r.clicks);
    grouped.set(key, g);
  }

  const byDay = new Map(daily.results.map((r) => [r.day, r]));
  const filled = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
    const r = byDay.get(day);
    return { day, views: num(r?.views), clicks: num(r?.clicks) };
  });
  const linkRows = links.results.map((l) => ({
    ...l,
    views: num(l.views), clicks: num(l.clicks), spotify: num(l.spotify), appleMusic: num(l.appleMusic), deezer: num(l.deezer), custom: num(l.custom),
  })) as LinkRow[];
  return {
    views: t.view ?? 0,
    clicks: t.click ?? 0,
    platforms: platformRows,
    customs,
    sources: [...grouped.values()],
    daily: filled,
    links: linkRows,
  };
}

export default app;
