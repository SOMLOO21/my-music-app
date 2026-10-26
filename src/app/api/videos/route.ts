import { findDuplicate, listVideos, saveVideo } from "@/lib/db";
import type { Video } from "@/lib/types";
import { fetchAndStoreThumbnail } from "@/lib/thumbnails";
import { newVideo } from "@/lib/videos";

export async function GET() {
  return Response.json(await listVideos());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Video>;
  if ((body.platform !== "tiktok" && body.platform !== "instagram") || !body.externalId || !body.embedUrl) {
    return Response.json({ error: "Vidéo invalide : analyse le lien d'abord." }, { status: 400 });
  }
  if (await findDuplicate({ platform: body.platform, externalId: body.externalId })) {
    return Response.json({ error: "Cette vidéo est déjà dans la bibliothèque." }, { status: 409 });
  }

  const video = newVideo(body as Video, { status: "published", tags: body.tags, comment: body.comment });
  await saveVideo(video);
  // Vignette conservée tout de suite, tant que le lien fourni par TikTok est encore valide.
  await fetchAndStoreThumbnail(video);
  return Response.json(video, { status: 201 });
}
