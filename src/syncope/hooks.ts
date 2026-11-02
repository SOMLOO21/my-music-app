// Banque de hooks : un dossier Google Drive public (ses sous-dossiers = catégories).
// Chaque hook est converti une fois pour toutes en MP4 H.264 lisible partout, puis gardé dans Vercel Blob.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { get } from '@vercel/blob';
import { sql } from '@/lib/sql';
import { PATHS, exists, save } from './storage';

const run = promisify(execFile);
const HOOKS_FOLDER = process.env.HOOKS_FOLDER || '1rAzAb0-6q1U6rUWApYkeDovLUFajz13a';
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const UA = { 'User-Agent': 'Mozilla/5.0' };
// Binaire installé par le paquet ffmpeg-static (inclus dans la fonction par next.config.ts).
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');

export interface Hook {
  id: string;
  name: string;
  category: string;
}

const unescapeHtml = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Contenu d'un dossier Drive partagé « tous les utilisateurs disposant du lien », sans clé API. */
async function driveList(folderId: string) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
  const page = await r.text();
  const out: { id: string; name: string; folder: boolean }[] = [];
  for (const m of page.matchAll(/<div class="flip-entry" id="entry-([\w-]+)"([\s\S]*?)<\/a><\/div>/g)) {
    const title = /<div class="flip-entry-title">([\s\S]*?)<\/div>/.exec(m[2]);
    const href = /href="([^"]+)"/.exec(m[2]);
    out.push({ id: m[1], name: title ? unescapeHtml(title[1]).trim() : '', folder: Boolean(href?.[1].includes('/folders/')) });
  }
  return out;
}

function cleanName(name: string) {
  const n = name.replace(/(\.crdownload)?(\.(mp4|mov|m4v|webm))+$/i, '').replace(/\s*\(\d+\)$/, '');
  return n.replace(/[-_]+/g, ' ').trim() || name;
}

let listed: { at: number; list: Hook[] } = { at: 0, list: [] };

/** Hooks du dossier, relus au plus toutes les 10 minutes (par instance du serveur). */
export async function hooksList(force = false) {
  if (!force && listed.list.length && Date.now() - listed.at < 600_000) return listed.list;
  const items: Hook[] = [];
  for (const e of await driveList(HOOKS_FOLDER)) {
    if (e.folder) {
      for (const f of await driveList(e.id)) {
        if (!f.folder && VIDEO_EXT.test(f.name)) items.push({ id: f.id, name: cleanName(f.name), category: e.name });
      }
    } else if (VIDEO_EXT.test(e.name)) {
      items.push({ id: e.id, name: cleanName(e.name), category: 'Divers' });
    }
  }
  listed = { at: Date.now(), list: items };
  return items;
}

export async function hookKnown(id: string) {
  return (await hooksList()).some((h) => h.id === id);
}

async function withTmp<T>(fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Télécharge le hook depuis Drive et le convertit (une seule fois : le résultat reste dans Blob). */
export async function ensureHookFile(id: string) {
  const out = PATHS.hook(id, 'mp4');
  if (await exists(out)) return out;
  await withTmp(async (dir) => {
    const raw = path.join(dir, 'src');
    const mp4 = path.join(dir, 'out.mp4');
    const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { headers: UA, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`Drive a refusé le hook (${r.status})`);
    await fs.writeFile(raw, Buffer.from(await r.arrayBuffer()));
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', mp4], { timeout: 120_000 });
    await save(out, await fs.readFile(mp4), 'video/mp4');
  });
  return out;
}

/** Vignette : celle de Drive si elle existe vraiment, sinon une image tirée du hook. */
export async function ensureHookThumb(id: string) {
  const out = PATHS.hook(id, 'jpg');
  if (await exists(out)) return out;
  try {
    const r = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w320`, { headers: UA, signal: AbortSignal.timeout(20_000) });
    const data = Buffer.from(await r.arrayBuffer());
    if (r.ok && data.length > 5000) { // en dessous, Drive renvoie une icône générique
      await save(out, data, 'image/jpeg');
      return out;
    }
  } catch {
    // vignette tirée du hook ci-dessous
  }
  const video = await get(await ensureHookFile(id), { access: 'private' });
  if (!video || video.statusCode !== 200) throw new Error('Hook introuvable');
  await withTmp(async (dir) => {
    const src = path.join(dir, 'hook.mp4');
    const jpg = path.join(dir, 'thumb.jpg');
    await fs.writeFile(src, Buffer.from(await new Response(video.stream).arrayBuffer()));
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.4', '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', jpg], { timeout: 60_000 });
    await save(out, await fs.readFile(jpg), 'image/jpeg');
  });
  return out;
}

// ---------- Compteurs d'usage ----------
export type HookEvent = 'previews' | 'uses' | 'exports';
export const HOOK_EVENTS: HookEvent[] = ['previews', 'uses', 'exports'];

export async function hookStats() {
  const { results } = await sql.prepare('SELECT * FROM syncope_hook_stats').all<{ hook_id: string } & Record<HookEvent, number>>();
  return new Map(results.map((r) => [r.hook_id, r]));
}

export async function addHookEvent(id: string, kind: HookEvent) {
  // kind vient de HOOK_EVENTS : nom de colonne sûr
  await sql
    .prepare(`INSERT INTO syncope_hook_stats (hook_id, ${kind}, last) VALUES (?1, 1, ?2)
      ON CONFLICT (hook_id) DO UPDATE SET ${kind} = ${kind} + 1, last = ?2`)
    .bind(id, new Date().toISOString().slice(0, 19))
    .run();
}
