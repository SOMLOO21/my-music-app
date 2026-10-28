// Usage : node --env-file=.env.local scripts/import-d1.mjs <export-d1.sql>
// Importe l'export D1 (Cloudflare) dans une base Turso déjà migrée.
// Ne garde que les tables de l'app (pas d1_migrations / sqlite_sequence).
import fs from "node:fs";
import { createClient } from "@libsql/client";
const [dumpFile] = process.argv.slice(2);
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const tables = ["taxonomy", "videos", "users", "sessions", "favorites", "thumbnails"];
const lines = fs.readFileSync(dumpFile, "utf8").split("\n").filter((l) => l.startsWith("INSERT INTO"));
const counts = {};
for (const table of tables) {
  const rows = lines.filter((l) => l.startsWith(`INSERT INTO "${table}"`));
  for (const l of rows) await db.execute(l.replace(/^INSERT INTO/, "INSERT OR REPLACE INTO"));
  counts[table] = rows.length;
}
for (const t of tables) counts[`${t} (en base)`] = Number((await db.execute(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
console.log(counts);
