// Import de vidéos par lien (YouTube, TikTok, Instagram, Vimeo…) avec yt-dlp.
// yt-dlp et ffmpeg ne peuvent pas tourner dans une fonction Vercel : chaque import démarre une
// Vercel Sandbox (petite machine isolée, arrêtée à la fin), que l'interface interroge chaque seconde.
// Une fois la vidéo téléchargée, le serveur la recopie dans Vercel Blob.
import { Sandbox } from '@vercel/sandbox';
import { sql } from '@/lib/sql';
import { PATHS, save } from './storage';

const FORMAT = 'bv*[vcodec^=avc1][height<=1080]/bv*[height<=1080][ext=mp4]/b[height<=1080][ext=mp4]/b[height<=1080]/b';

// Script lancé dans la sandbox : installe yt-dlp (avec Deno, exigé par YouTube) et un ffmpeg,
// télécharge la vidéo, puis écrit le code de sortie dans /tmp/exit. Le lien arrive par la variable URL.
const SCRIPT = `
mkdir -p /tmp/out /tmp/bin
{
  python3 -m venv /tmp/venv &&
  /tmp/venv/bin/pip install -q "yt-dlp[default,deno,curl-cffi]" imageio-ffmpeg &&
  ln -sf "$(/tmp/venv/bin/python -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())')" /tmp/bin/ffmpeg &&
  /tmp/venv/bin/yt-dlp --ffmpeg-location /tmp/bin/ffmpeg --no-playlist --newline --no-warnings --no-simulate --progress \\
    -f "$FORMAT" --merge-output-format mp4 --remux-video mp4 \\
    --match-filter "duration <= 900" --max-filesize 400M \\
    --progress-template "download:PROG %(progress._percent_str)s" \\
    --print "before_dl:TITLE %(title)s" --print "after_move:FILE %(filepath)s" \\
    -o "/tmp/out/video.%(ext)s" "$URL"
} > /tmp/log 2>&1
echo $? > /tmp/exit
`;

export interface ImportJob {
  id: string;
  user_id: string;
  sandbox: string | null;
  status: 'downloading' | 'processing' | 'done' | 'error';
  progress: number;
  title: string | null;
  file: string | null;
  error: string | null;
}

function friendlyError(line: string) {
  const low = line.toLowerCase();
  if (low.includes('not a bot')) return 'YouTube bloque les téléchargements depuis nos serveurs : télécharge la vidéo toi-même, puis ajoute-la comme fichier.';
  if (['private', 'login', 'sign in', 'cookies'].some((w) => low.includes(w))) return 'Vidéo privée ou réservée aux comptes connectés : impossible de la récupérer.';
  if (low.includes('unsupported url')) return "Ce lien n'est pas pris en charge.";
  if (low.includes('does not pass filter')) return 'Vidéo trop longue (15 minutes maximum).';
  if (low.includes('larger than max-filesize') || low.includes('file is larger')) return 'Vidéo trop lourde (400 Mo maximum).';
  if (['unavailable', 'not available', 'removed'].some((w) => low.includes(w))) return 'Vidéo indisponible (supprimée, privée ou bloquée dans ton pays).';
  return `Import impossible : ${line.replace(/^ERROR:\s*/, '').slice(0, 160)}`;
}

const now = () => new Date().toISOString().slice(0, 19);

export async function startImport(userId: string, url: string) {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const sandbox = await Sandbox.create({ image: 'vercel/sandbox/python:3.14', timeout: 15 * 60_000, resources: { vcpus: 2 } });
  await sandbox.runCommand({ cmd: 'sh', args: ['-c', SCRIPT], env: { URL: url, FORMAT }, detached: true });
  await sql
    .prepare(`INSERT INTO syncope_imports (id, user_id, url, sandbox, status, rights_ok_at, created_at)
      VALUES (?1, ?2, ?3, ?4, 'downloading', ?5, ?5)`)
    .bind(id, userId, url, sandbox.name, now())
    .run();
  return id;
}

const fail = async (job: ImportJob, error: string) => {
  await sql.prepare("UPDATE syncope_imports SET status = 'error', error = ?2 WHERE id = ?1").bind(job.id, error).run();
  return { ...job, status: 'error' as const, error };
};

/** État d'un import ; quand la sandbox a fini, recopie la vidéo dans Blob et arrête la sandbox. */
export async function pollImport(job: ImportJob): Promise<ImportJob> {
  if (job.status === 'done' || job.status === 'error' || !job.sandbox) return job;
  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.get({ name: job.sandbox });
  } catch {
    return fail(job, 'Import interrompu : réessaie.');
  }
  const [exit, log] = await Promise.all([
    sandbox.readFileToBuffer({ path: '/tmp/exit' }),
    sandbox.readFileToBuffer({ path: '/tmp/log' }),
  ]);
  const lines = (log?.toString('utf8') ?? '').split('\n').map((l) => l.trim());
  let { progress, title } = job;
  let file = '';
  let lastErr = '';
  let merging = false;
  for (const line of lines) {
    const pct = line.startsWith('PROG') ? /([\d.]+)%/.exec(line) : null;
    if (pct) progress = Number(pct[1]);
    else if (line.startsWith('TITLE ')) title = line.slice(6);
    else if (line.startsWith('FILE ')) file = line.slice(5);
    else if (line.startsWith('ERROR')) lastErr = line;
    else if (line.includes('[Merger]') || line.includes('[VideoRemuxer]')) merging = true;
  }

  if (exit === null) {
    await sql.prepare('UPDATE syncope_imports SET progress = ?2, title = ?3 WHERE id = ?1').bind(job.id, progress, title).run();
    return { ...job, progress, title, status: merging ? 'processing' : 'downloading' };
  }
  if (exit.toString().trim() !== '0' || !file) {
    await sandbox.stop().catch(() => {});
    return fail(job, friendlyError(lastErr || 'ERROR: erreur inconnue'));
  }

  // Une seule requête recopie la vidéo, même si l'interface interroge pendant la copie.
  const claimed = await sql
    .prepare("UPDATE syncope_imports SET status = 'processing', title = ?2 WHERE id = ?1 AND status = 'downloading' RETURNING id")
    .bind(job.id, title)
    .first();
  if (!claimed) return { ...job, title, status: 'processing' };
  try {
    const stream = await sandbox.readFile({ path: file });
    if (!stream) throw new Error('fichier absent');
    const name = `${job.id}.mp4`;
    await save(PATHS.media(job.user_id, name), stream, 'video/mp4');
    await sql.prepare("UPDATE syncope_imports SET status = 'done', progress = 100, file = ?2 WHERE id = ?1").bind(job.id, name).run();
    return { ...job, title, status: 'done', progress: 100, file: name };
  } catch (e) {
    return fail(job, `Import impossible : ${e instanceof Error ? e.message : e}`);
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
