// Booking : identité de l'artiste pour les pages et les routes /api/booking.
// L'identité vient uniquement de currentUser() (cookie de session), jamais d'un paramètre envoyé par le navigateur.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_AS_COOKIE, currentUser, type PublicUser } from "@/lib/accounts";

/** Pages : l'artiste connecté, sinon renvoi vers /compte avec retour sur la page demandée. */
export async function pageUser(path: string): Promise<PublicUser> {
  const user = await currentUser();
  if (!user) redirect(`/compte?retour=${encodeURIComponent(path)}`);
  return user;
}

/** Compte ouvert par l'équipe depuis /admin (« se connecter en tant que »). */
export async function isAdminSession(user: PublicUser) {
  const adminAs = (await cookies()).get(ADMIN_AS_COOKIE)?.value;
  return Boolean(adminAs && decodeURIComponent(adminAs) === user.pseudo);
}

export const unauthorized = () => Response.json({ error: "Connecte-toi pour utiliser Booking." }, { status: 401 });
export const notFound = (what = "Élément") => Response.json({ error: `${what} introuvable.` }, { status: 404 });
export const badRequest = (error: string) => Response.json({ error }, { status: 400 });

/** Corps JSON de la requête (objet vide s'il est absent ou invalide). */
export async function body(req: Request): Promise<Record<string, unknown>> {
  const data = await req.json().catch(() => ({}));
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}
