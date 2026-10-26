import { sanitizeTags, type ResolvedLink, type Video, type VideoStatus } from "./types";

export function newVideo(link: ResolvedLink, extra: { status: VideoStatus; tags?: unknown; comment?: string; suggestedBy?: Video["suggestedBy"] }): Video {
  return {
    id: crypto.randomUUID(),
    platform: link.platform,
    url: link.url ?? "",
    embedUrl: link.embedUrl,
    externalId: link.externalId,
    title: link.title ?? "",
    author: link.author ?? "",
    thumbnail: link.thumbnail ?? "",
    status: extra.status,
    ...(extra.suggestedBy && { suggestedBy: extra.suggestedBy }),
    comment: extra.comment ?? "",
    tags: sanitizeTags(extra.tags),
    createdAt: new Date().toISOString(),
  };
}

/** Trouve le premier lien TikTok ou Instagram dans un texte partagé (« Regarde cette vidéo… https://vm.tiktok.com/… »). */
export function extractLink(text: string) {
  return text.match(/https?:\/\/[^\s"'<>]+/g)?.find((u) => /(tiktok|instagram)\.com/i.test(u));
}
