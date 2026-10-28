// TEMPORAIRE : import des données de l'ancienne base Cloudflare D1 (protégé par le mot de passe
// de l'admin via src/proxy.ts). À supprimer une fois la migration vers Turso terminée.
import { sql } from "@/lib/sql";

const TABLES = ["taxonomy", "videos", "users", "sessions", "favorites", "thumbnails"];

export async function POST(req: Request) {
  const { statements } = (await req.json()) as { statements?: string[] };
  if (!Array.isArray(statements) || statements.length === 0) {
    return Response.json({ error: "Aucune instruction reçue." }, { status: 400 });
  }
  // Uniquement des insertions dans les tables de l'app.
  const allowed = statements.every((s) => TABLES.some((t) => s.startsWith(`INSERT OR REPLACE INTO "${t}"`)));
  if (!allowed) return Response.json({ error: "Instruction non autorisée." }, { status: 400 });

  await sql.batch(statements.map((s) => sql.prepare(s)));
  return Response.json({ imported: statements.length });
}
