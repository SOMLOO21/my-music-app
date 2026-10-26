import { deleteVideo, getVideo, saveVideo } from "@/lib/db";
import { sanitizeTags } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const video = await getVideo(id);
  if (!video) return Response.json({ error: "Vidéo introuvable." }, { status: 404 });

  if ("tags" in body) video.tags = sanitizeTags(body.tags);
  if (typeof body.comment === "string") video.comment = body.comment;
  if (typeof body.title === "string") video.title = body.title;
  if (body.status === "draft" || body.status === "published") video.status = body.status;

  await saveVideo(video);
  return Response.json(video);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await deleteVideo(id);
  return Response.json({ ok: true });
}
