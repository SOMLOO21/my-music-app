// TEMPORAIRE : envoie l'export de l'ancienne base D1 à l'app en ligne (route /api/admin/import),
// par paquets de moins de 4 Mo. Le mot de passe de l'admin est demandé au lancement.
// Usage : node scripts/upload-d1.mjs <export-d1.sql> <adresse du site>
import fs from "node:fs";
import readline from "node:readline";

const [dumpFile, site] = process.argv.slice(2);
const tables = ["taxonomy", "videos", "users", "sessions", "favorites", "thumbnails"];
const statements = fs
  .readFileSync(dumpFile, "utf8")
  .split("\n")
  .filter((l) => tables.some((t) => l.startsWith(`INSERT INTO "${t}"`)))
  .map((l) => l.replace(/^INSERT INTO/, "INSERT OR REPLACE INTO"));

// Mot de passe : variable ADMIN_PASSWORD (saisie par le terminal), sinon demandé ici sans être affiché.
const password = process.env.ADMIN_PASSWORD || await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  process.stdout.write("Mot de passe de l'admin : ");
  rl.question("", (answer) => {
    rl.close();
    process.stdout.write("\n");
    resolve(answer);
  });
});
if (!password) {
  console.error("Mot de passe vide : import annulé.");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`admin:${password}`).toString("base64");

let batch = [];
let size = 0;
let sent = 0;
async function flush() {
  if (batch.length === 0) return;
  const res = await fetch(`${site.replace(/\/$/, "")}/api/admin/import`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ statements: batch }),
  });
  if (!res.ok) {
    console.error(`Erreur ${res.status} : ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  sent += batch.length;
  console.log(`${sent} / ${statements.length} lignes importées`);
  batch = [];
  size = 0;
}
for (const s of statements) {
  if (size + s.length > 3_000_000) await flush();
  batch.push(s);
  size += s.length;
}
await flush();
console.log("Import terminé ✓");
