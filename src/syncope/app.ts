// SYNCOPE : studio de vidéos courtes sur le son de l'artiste, intégré à My Music App sous /syncope.
// - /syncope            l'interface (src/syncope/index.html ; ses scripts sont dans public/syncope/)
// - /syncope/api/…      banque de clips, hooks, « Mes sons », import par lien
// - /syncope/media/…    vidéos importées par lien
// Compte My Music App obligatoire ; chaque artiste ne voit que ses sons et ses imports.
// Monté dans Next.js par src/app/syncope/[[...path]]/route.ts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { currentUser, type PublicUser } from '@/lib/accounts';
import { sql } from '@/lib/sql';
import { BankError, MOODS, MOOD_BY_ID, bank, provider, proxyClip } from './bank';
import { HOOK_EVENTS, addHookEvent, ensureHookFile, ensureHookThumb, hookKnown, hookStats, hooksList, type HookEvent } from './hooks';
import { pollImport, startImport, type ImportJob } from './importer';
import { PATHS, exists, serve } from './storage';

type AppEnv = { Variables: { user: PublicUser } };
const app = new Hono<AppEnv>().basePath('/syncope');

const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm', 'mp4', 'aif', 'aiff'];
const MAX_SONG = 300 * 1024 * 1024;
const UPLOADS = 'syncope/songs/upload/'; // sons envoyés depuis le navigateur
const now = () => new Date().toISOString().slice(0, 19);
const fail = (c: Context, detail: string, status = 400) => c.json({ detail }, status as 400);

// Connexion obligatoire : l'interface renvoie vers /compte, l'API répond 401.
app.use('*', async (c, next) => {
  const user = await currentUser();
  if (!user) return c.req.path.startsWith('/syncope/api/') || c.req.path.startsWith('/syncope/media/') ? fail(c, 'Connexion requise', 401) : c.redirect('/compte');
  c.set('user', user);
  await next();
});

app.onError((e, c) => {
  if (e instanceof BankError) return c.json({ detail: e.message, ...(e.needKey ? { need_key: true } : {}) }, e.status as 400);
  console.error('[syncope]', e);
  return fail(c, `Erreur : ${e.message}`, 500);
});

app.get('/', async (c) => c.html(await fs.readFile(path.join(process.cwd(), 'src/syncope/index.html'), 'utf8')));

app.get('/api/status', (c) => c.json({ provider: provider(), ytdlp: true }));

// ───────────── Banque de clips ─────────────
app.get('/api/bank/moods', (c) => c.json({ moods: MOODS.map(({ id, name, colors }) => ({ id, name, colors })) }));

app.get('/api/bank', async (c) => {
  const mood = MOOD_BY_ID.get(c.req.query('mood') ?? '');
  if (!mood) return fail(c, 'Mood inconnu');
  return c.json(await bank(mood.queries, c.req.query('orientation') ?? '', c.req.query('dur') ?? '', Number(c.req.query('page')) || 1));
});

app.get('/api/bank/search', async (c) => {
  const term = (c.req.query('q') ?? '').trim().slice(0, 80);
  if (!term) return c.json({ clips: [], page: 1, has_more: false });
  return c.json(await bank([term], c.req.query('orientation') ?? '', c.req.query('dur') ?? '', Number(c.req.query('page')) || 1));
});

app.get('/api/proxy', (c) => proxyClip(c.req.query('u') ?? '', c.req.header('range') ?? null));

// La clé de la banque est réglée par l'équipe (variable PIXABAY_API_KEY sur Vercel), pas par les artistes.
app.post('/api/settings/key', (c) => fail(c, "La banque de clips n'est pas encore configurée : préviens l'équipe Mymusicads."));

// ───────────── Banque de hooks ─────────────
app.get('/api/hooks', async (c) => {
  const [items, stats] = await Promise.all([hooksList(c.req.query('refresh') === '1'), hookStats()]);
  return c.json({ hooks: items.map((h) => ({ ...h, previews: stats.get(h.id)?.previews ?? 0, uses: stats.get(h.id)?.uses ?? 0, exports: stats.get(h.id)?.exports ?? 0 })) });
});

app.get('/api/hooks/:kind{file|thumb}/:id{[\\w-]+}', async (c) => {
  const { kind, id } = c.req.param();
  if (!(await hookKnown(id))) return fail(c, 'Hook inconnu', 404);
  return kind === 'file'
    ? serve(await ensureHookFile(id), c.req.header('range') ?? null, 'video/mp4')
    : serve(await ensureHookThumb(id), null, 'image/jpeg');
});

app.post('/api/hooks/event', async (c) => {
  const { id = '', type = '' } = await c.req.json<{ id?: string; type?: string }>().catch(() => ({ id: '', type: '' }));
  if (!HOOK_EVENTS.includes(type as HookEvent) || !(await hookKnown(id))) return fail(c, 'Événement invalide');
  await addHookEvent(id, type as HookEvent);
  return c.json({ ok: true });
});

// ───────────── Mes sons ─────────────
interface SongRow {
  id: string;
  name: string;
  ext: string;
  size: number;
  duration: number;
  blob_path: string;
  project: string | null;
  created_at: string;
  saved_at: string | null;
}

function songMeta(s: SongRow) {
  let proj: { bpm?: number; words?: { emph?: boolean }[]; hook?: unknown } = {};
  try {
    proj = s.project ? JSON.parse(s.project) : {};
  } catch {
    // projet illisible : on garde les infos du son
  }
  const words = proj.words ?? [];
  return {
    id: s.id, name: s.name, ext: s.ext, size: s.size, duration: s.duration, created: s.created_at,
    bpm: proj.bpm ?? null, words: words.length, keys: words.filter((w) => w.emph).length,
    hook: Boolean(proj.hook), updated: s.saved_at ?? s.created_at,
  };
}

const findSong = (c: Context<AppEnv>) =>
  sql.prepare('SELECT * FROM syncope_songs WHERE id = ?1 AND user_id = ?2').bind(c.req.param('id'), c.get('user').id).first<SongRow>();

app.get('/api/songs', async (c) => {
  const { results } = await sql.prepare('SELECT * FROM syncope_songs WHERE user_id = ?1').bind(c.get('user').id).all<SongRow>();
  return c.json({ songs: results.map(songMeta).sort((a, b) => b.updated.localeCompare(a.updated)) });
});

// Envoi direct du navigateur vers Vercel Blob : ici, on autorise l'envoi (dossier syncope/songs/upload/,
// nom rendu impossible à deviner par un suffixe aléatoire). C'est POST /api/songs qui rattache le son au compte.
app.post('/api/songs/upload', async (c) => {
  const body = await c.req.json<HandleUploadBody>();
  const result = await handleUpload({
    body,
    request: c.req.raw,
    onBeforeGenerateToken: async (pathname) => {
      const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
      if (!pathname.startsWith(UPLOADS) || !AUDIO_EXT.includes(ext)) throw new Error('Format audio non pris en charge');
      return { maximumSizeInBytes: MAX_SONG, addRandomSuffix: true };
    },
    // Appelé par Vercel une fois l'envoi fini ; le son est enregistré par POST /api/songs.
    onUploadCompleted: async () => {},
  });
  return c.json(result);
});

app.post('/api/songs', async (c) => {
  const user = c.get('user');
  const q = await c.req.json<{ pathname?: string; name?: string; ext?: string; size?: number; duration?: number }>();
  const ext = (q.ext ?? '').toLowerCase();
  if (!AUDIO_EXT.includes(ext)) return fail(c, 'Format audio non pris en charge');
  if (!q.pathname?.startsWith(UPLOADS) || !(await exists(q.pathname))) return fail(c, 'Fichier non reçu : réessaie.');
  const taken = await sql.prepare('SELECT id FROM syncope_songs WHERE blob_path = ?1').bind(q.pathname).first();
  if (taken) return fail(c, 'Ce fichier est déjà enregistré.');
  const size = Number(q.size) || 0;
  if (!(size > 0 && size <= MAX_SONG)) return fail(c, 'Fichier vide ou trop lourd (300 Mo maximum)');
  const row: SongRow = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12), name: (q.name ?? '').trim().slice(0, 120) || 'Sans titre', ext, size,
    duration: Number(q.duration) || 0, blob_path: q.pathname, project: null, created_at: now(), saved_at: null,
  };
  await sql
    .prepare('INSERT INTO syncope_songs (id, user_id, name, ext, size, duration, blob_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(row.id, user.id, row.name, row.ext, row.size, row.duration, row.blob_path, row.created_at)
    .run();
  return c.json(songMeta(row));
});

app.get('/api/songs/:id/audio', async (c) => {
  const song = await findSong(c);
  return song ? serve(song.blob_path, c.req.header('range') ?? null, 'application/octet-stream') : fail(c, 'Son inconnu', 404);
});

app.get('/api/songs/:id/project', async (c) => {
  const song = await findSong(c);
  if (!song) return fail(c, 'Son inconnu', 404);
  return c.body(song.project ?? '{}', 200, { 'Content-Type': 'application/json; charset=utf-8' });
});

app.put('/api/songs/:id/project', async (c) => {
  if (!(await findSong(c))) return fail(c, 'Son inconnu', 404);
  const data = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const savedAt = now();
  await sql
    .prepare('UPDATE syncope_songs SET project = ?2, saved_at = ?3 WHERE id = ?1')
    .bind(c.req.param('id'), JSON.stringify({ ...data, saved_at: savedAt }), savedAt)
    .run();
  return c.json({ ok: true, saved_at: savedAt });
});

app.patch('/api/songs/:id', async (c) => {
  const song = await findSong(c);
  if (!song) return fail(c, 'Son inconnu', 404);
  const { name: raw = '' } = await c.req.json<{ name?: string }>().catch(() => ({ name: '' }));
  const name = raw.trim().slice(0, 120);
  if (!name) return fail(c, 'Donne un nom au son');
  await sql.prepare('UPDATE syncope_songs SET name = ?2 WHERE id = ?1').bind(song.id, name).run();
  return c.json(songMeta({ ...song, name }));
});

app.delete('/api/songs/:id', async (c) => {
  const song = await findSong(c);
  if (song) {
    await sql.prepare('DELETE FROM syncope_songs WHERE id = ?1').bind(song.id).run();
    await del(song.blob_path).catch(() => {});
  }
  return c.json({ ok: true });
});

// ───────────── Import par lien ─────────────
app.post('/api/import', async (c) => {
  const data = await c.req.json<{ url?: string; rights_ok?: boolean }>().catch(() => ({}) as { url?: string; rights_ok?: boolean });
  const url = (data.url ?? '').trim();
  if (!/^https?:\/\//.test(url)) return fail(c, 'Colle un lien complet (https://…)');
  if (data.rights_ok !== true) return fail(c, 'Coche la case sur les droits de la vidéo.');
  return c.json({ job_id: await startImport(c.get('user').id, url) });
});

app.get('/api/import/:id{[\\w-]+}', async (c) => {
  const job = await sql.prepare('SELECT * FROM syncope_imports WHERE id = ?1 AND user_id = ?2').bind(c.req.param('id'), c.get('user').id).first<ImportJob>();
  if (!job) return fail(c, 'Import introuvable', 404);
  const { status, progress, title, file, error } = await pollImport(job);
  return c.json({ status, progress, title, file, error });
});

app.get('/media/:file{[\\w.-]+}', (c) => serve(PATHS.media(c.get('user').id, c.req.param('file')), c.req.header('range') ?? null, 'video/mp4'));

export default app;
