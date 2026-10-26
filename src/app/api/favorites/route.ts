import { addFavorites, currentUser, removeFavorite } from "@/lib/accounts";

/** Ajoute ou retire un favori pour l'artiste connecté. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Connecte-toi pour enregistrer tes favoris." }, { status: 401 });

  const { videoId, favorite } = (await req.json()) as { videoId?: string; favorite?: boolean };
  if (!videoId) return Response.json({ error: "Vidéo manquante." }, { status: 400 });

  if (favorite) await addFavorites(user.id, { [videoId]: new Date().toISOString() });
  else await removeFavorite(user.id, videoId);
  return Response.json({ ok: true });
}
