import { suggestTags } from "@/lib/classify";
import { getTaxonomy } from "@/lib/db";
import type { ResolvedLink } from "@/lib/types";

/** Propose des tags pour une vidéo déjà analysée (bouton « Proposer les tags » de l'admin). */
export async function POST(req: Request) {
  const link = (await req.json()) as ResolvedLink;
  if (!link?.platform || !link.externalId) {
    return Response.json({ error: "Vidéo invalide : analyse le lien d'abord." }, { status: 400 });
  }
  return Response.json(await suggestTags(link, await getTaxonomy()));
}
