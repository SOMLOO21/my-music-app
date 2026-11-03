// Réservé à l'équipe (protégé par le mot de passe du site) : ouvre le compte d'un artiste
// pour l'aider sur My Music Link ou Booking. Session limitée à 2 h ; « Revenir à l'admin » rétablit la session d'origine.
import { cookies } from "next/headers";
import { ADMIN_AS_COOKIE, ADMIN_RETURN_COOKIE, ADMIN_SESSION_SECONDS, SESSION_COOKIE, startAdminSession } from "@/lib/accounts";
import { sql } from "@/lib/sql";

export async function POST(req: Request) {
  const { userId, app } = (await req.json().catch(() => ({}))) as { userId?: string; app?: string };
  const user = userId
    ? await sql.prepare("SELECT id, pseudo FROM users WHERE id = ?1").bind(userId).first<{ id: string; pseudo: string }>()
    : null;
  if (!user) return Response.json({ error: "Compte introuvable." }, { status: 404 });

  const jar = await cookies();
  // On garde la session d'origine (sauf si on passe déjà d'un artiste à un autre)
  const previous = jar.get(ADMIN_AS_COOKIE) ? jar.get(ADMIN_RETURN_COOKIE)?.value : jar.get(SESSION_COOKIE)?.value;
  const opts = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ADMIN_SESSION_SECONDS}`;

  const headers = new Headers({ "content-type": "application/json" });
  headers.append("Set-Cookie", await startAdminSession(user.id));
  headers.append("Set-Cookie", `${ADMIN_RETURN_COOKIE}=${previous || "-"}; ${opts}`);
  headers.append("Set-Cookie", `${ADMIN_AS_COOKIE}=${encodeURIComponent(user.pseudo)}; ${opts}`);
  console.log(`[admin] ouverture du compte @${user.pseudo}`);
  return new Response(JSON.stringify({ ok: true, redirect: app === "booking" ? "/booking" : "/link" }), { headers });
}
