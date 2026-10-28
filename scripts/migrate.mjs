// Applique les fichiers migrations/*.sql pas encore passés sur la base Turso.
// Usage : npm run db:migrate  (lit TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, ex. dans .env.local)
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL n'est pas défini.");
  process.exit(1);
}
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

await db.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const done = new Set((await db.execute("SELECT name FROM _migrations")).rows.map((r) => r.name));

const dir = path.join(process.cwd(), "migrations");
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  await db.executeMultiple(fs.readFileSync(path.join(dir, file), "utf8"));
  await db.execute({ sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", args: [file, new Date().toISOString()] });
  console.log(`✓ ${file}`);
}
console.log("Base à jour.");
