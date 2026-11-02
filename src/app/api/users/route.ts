// Réservé à l'équipe (protégé par le mot de passe du site) : liste des artistes inscrits
// et réinitialisation de mot de passe.
import { listUsers, resetPassword } from "@/lib/accounts";
import { sql } from "@/lib/sql";

export async function GET() {
  const [users, link] = await Promise.all([
    listUsers(),
    // Activité My Music Link : nombre de smart links, vues et clics (tout historique)
    sql
      .prepare(
        `SELECT l.user_id,
           COUNT(DISTINCT l.id) AS links,
           COALESCE(SUM(e.type = 'view'), 0) AS views,
           COALESCE(SUM(e.type = 'click'), 0) AS clicks
         FROM ml_links l LEFT JOIN ml_events e ON e.link_id = l.id GROUP BY l.user_id`,
      )
      .all<{ user_id: string; links: number; views: number; clicks: number }>(),
  ]);
  const byUser = new Map(link.results.map((r) => [r.user_id, r]));
  return Response.json(
    users.map((u) => {
      const l = byUser.get(u.id);
      return { ...u, links: Number(l?.links ?? 0), views: Number(l?.views ?? 0), clicks: Number(l?.clicks ?? 0) };
    }),
  );
}

export async function POST(req: Request) {
  const { userId, password } = (await req.json()) as { userId?: string; password?: string };
  if (!userId || !password || password.length < 6) {
    return Response.json({ error: "Le mot de passe doit faire au moins 6 caractères." }, { status: 400 });
  }
  await resetPassword(userId, password);
  return Response.json({ ok: true });
}
