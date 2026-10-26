// Vignette d'une vidéo, servie depuis la base (téléchargée à la première demande).
// Public : utilisée par le fil et la grille.
import { getVideo } from "@/lib/db";
import { fetchAndStoreThumbnail, getStoredThumbnail } from "@/lib/thumbnails";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thumb = (await getStoredThumbnail(id)) ?? (await (async () => {
    const video = await getVideo(id);
    return video ? fetchAndStoreThumbnail(video) : null;
  })());

  if (!thumb) {
    return new Response("Pas de vignette", { status: 404, headers: { "Cache-Control": "public, max-age=600" } });
  }
  return new Response(thumb.bytes, {
    headers: { "Content-Type": thumb.contentType, "Cache-Control": "public, max-age=604800" },
  });
}
