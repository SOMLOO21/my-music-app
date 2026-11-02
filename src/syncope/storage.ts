// Fichiers de SYNCOPE dans Vercel Blob (store privé) : sons, hooks convertis, vidéos importées.
// Le navigateur n'y a pas accès directement : chaque fichier est relu et servi par le serveur.
import { get, head, put } from '@vercel/blob';

export const PATHS = {
  song: (userId: string, name: string) => `syncope/songs/${userId}/${name}`,
  hook: (id: string, ext: 'mp4' | 'jpg') => `syncope/hooks/${id}.${ext}`,
  media: (userId: string, file: string) => `syncope/imports/${userId}/${file}`,
};

export async function exists(pathname: string) {
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

export function save(pathname: string, body: Buffer | ReadableStream | NodeJS.ReadableStream, contentType: string) {
  return put(pathname, body as Buffer, {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: !Buffer.isBuffer(body),
  });
}

/** Sert un fichier du store, avec la lecture partielle (Range) dont les lecteurs vidéo ont besoin. */
export async function serve(pathname: string, range: string | null, contentType?: string) {
  const r = await get(pathname, { access: 'private', headers: range ? { Range: range } : undefined });
  if (!r || r.statusCode !== 200) return Response.json({ detail: 'Fichier introuvable' }, { status: 404 });
  const headers = new Headers({
    'Content-Type': contentType ?? r.blob.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400',
  });
  for (const h of ['Content-Length', 'Content-Range', 'ETag']) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(r.stream, { status: headers.has('Content-Range') ? 206 : 200, headers });
}
