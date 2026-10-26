// Réception d'un partage depuis le téléphone (Raccourci iOS, partage Android, page /partager).
// La vidéo arrive en brouillon dans « À configurer » et n'apparaît pas dans le fil.
import { suggestTags } from "@/lib/classify";
import { findDuplicate, getTaxonomy, saveVideo } from "@/lib/db";
import { resolveLink } from "@/lib/links";
import { fetchAndStoreThumbnail } from "@/lib/thumbnails";
import { extractLink, newVideo } from "@/lib/videos";

export async function POST(req: Request) {
  // On lit le corps en texte brut pour accepter n'importe quel format (JSON avec une clé
  // quelconque, formulaire, texte simple) : le Raccourci iOS est vite mal configuré.
  let raw = (await req.text()).replace(/\\\//g, "/");
  try {
    raw = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    // Texte non encodé (ou contenant un « % » isolé) : on le garde tel quel.
  }
  const url = extractLink(raw);
  if (!url) return Response.json({ error: "Aucun lien TikTok ou Instagram trouvé." }, { status: 400 });

  let link;
  try {
    link = await resolveLink(url);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const existing = await findDuplicate(link);
  if (existing) return Response.json({ result: "duplicate", video: existing });

  // Les tags sont pré-remplis : il ne reste qu'à vérifier avant de publier.
  const { tags, source } = await suggestTags(link, await getTaxonomy());
  const video = newVideo(link, { status: "draft", tags, suggestedBy: source });
  await saveVideo(video);
  // Vignette conservée tout de suite, tant que le lien fourni par TikTok est encore valide.
  await fetchAndStoreThumbnail(video);
  return Response.json({ result: "added", video }, { status: 201 });
}
