// Usage : node --env-file=.env.local scripts/import-syncope.mjs <dossier des données SYNCOPE> <pseudo>
// Recopie les données de l'ancien serveur SYNCOPE (library/, hooks-cache/, imports/, hooks-stats.json)
// dans Vercel Blob et Turso. Les sons et les vidéos importées sont rattachés au compte <pseudo>.
// Relançable sans risque : ce qui est déjà en place est sauté.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { head, put } from "@vercel/blob";

const [dataDir, pseudo] = process.argv.slice(2);
if (!dataDir || !pseudo) {
  console.error("Usage : node --env-file=.env.local scripts/import-syncope.mjs <dossier des données> <pseudo>");
  process.exit(1);
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const user = (await db.execute({ sql: "SELECT id FROM users WHERE pseudo = ?", args: [pseudo] })).rows[0];
if (!user) {
  console.error(`Aucun compte avec le pseudo « ${pseudo} ».`);
  process.exit(1);
}

const TYPES = { mp4: "video/mp4", jpg: "image/jpeg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" };
async function upload(pathname, file) {
  try {
    await head(pathname);
    return false; // déjà envoyé
  } catch {
    const ext = path.extname(file).slice(1).toLowerCase();
    const size = fs.statSync(file).size;
    await put(pathname, fs.createReadStream(file), {
      access: "private", addRandomSuffix: false, allowOverwrite: true,
      contentType: TYPES[ext] ?? "application/octet-stream", multipart: size > 20 * 1024 * 1024,
    });
    return true;
  }
}
const counts = { hooks: 0, songs: 0, imports: 0, stats: 0 };

// Hooks déjà convertis (MP4 + vignettes)
const hooksDir = path.join(dataDir, "hooks-cache");
for (const f of fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : []) {
  if (/^[\w-]+\.(mp4|jpg)$/.test(f) && (await upload(`syncope/hooks/${f}`, path.join(hooksDir, f)))) counts.hooks++;
}

// Sons et leurs projets
const libDir = path.join(dataDir, "library");
for (const sid of fs.existsSync(libDir) ? fs.readdirSync(libDir) : []) {
  const dir = path.join(libDir, sid);
  if (!fs.existsSync(path.join(dir, "meta.json"))) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const project = fs.existsSync(path.join(dir, "project.json")) ? fs.readFileSync(path.join(dir, "project.json"), "utf8") : null;
  const blobPath = `syncope/songs/${user.id}/${sid}.${meta.ext}`;
  await upload(blobPath, path.join(dir, `audio.${meta.ext}`));
  const savedAt = project ? (JSON.parse(project).saved_at ?? null) : null;
  await db.execute({
    sql: `INSERT OR IGNORE INTO syncope_songs (id, user_id, name, ext, size, duration, blob_path, project, created_at, saved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [sid, user.id, meta.name, meta.ext, meta.size, meta.duration ?? 0, blobPath, project, meta.created, savedAt],
  });
  counts.songs++;
}

// Vidéos importées par lien (utilisées dans les projets)
const impDir = path.join(dataDir, "imports");
for (const f of fs.existsSync(impDir) ? fs.readdirSync(impDir) : []) {
  if (/^[\w.-]+\.mp4$/.test(f) && (await upload(`syncope/imports/${user.id}/${f}`, path.join(impDir, f)))) counts.imports++;
}

// Compteurs de la banque de hooks
const statsFile = path.join(dataDir, "hooks-stats.json");
if (fs.existsSync(statsFile)) {
  for (const [id, s] of Object.entries(JSON.parse(fs.readFileSync(statsFile, "utf8")))) {
    await db.execute({
      sql: `INSERT INTO syncope_hook_stats (hook_id, previews, uses, exports, last) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (hook_id) DO UPDATE SET previews = excluded.previews, uses = excluded.uses, exports = excluded.exports, last = excluded.last`,
      args: [id, s.previews ?? 0, s.uses ?? 0, s.exports ?? 0, s.last ?? null],
    });
    counts.stats++;
  }
}
console.log(counts);
