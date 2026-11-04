// Drop : identité de l'artiste pour les pages et les routes /api/drop.
// L'identité vient uniquement de currentUser() (cookie de session), jamais d'un paramètre envoyé par le navigateur.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ADMIN_AS_COOKIE, currentUser, type PublicUser } from "@/lib/accounts";
import { firstError } from "./inputs";

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

export const unauthorized = () => Response.json({ error: "Connecte-toi pour utiliser Drop." }, { status: 401 });
export const notFound = (what = "Sortie") => Response.json({ error: `${what} introuvable.` }, { status: 404 });
export const badRequest = (error: string) => Response.json({ error }, { status: 400 });

/** Corps JSON validé par un schéma zod, ou réponse 400 avec un message lisible. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  const raw = await req.json().catch(() => null);
  const res = schema.safeParse(raw ?? {});
  return res.success ? { data: res.data } : { response: badRequest(firstError(res.error)) };
}
