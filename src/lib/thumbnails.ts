// Vignettes : téléchargées une fois puis conservées en base, car les liens d'image
// fournis par TikTok expirent au bout de quelques jours (et TikTok limite les demandes).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { freshTikTokThumbnail, thumbnailExpiresSoon } from "./links";
import type { Video } from "./types";

const db = () => getCloudflareContext().env.DB;
const MAX_BYTES = 1_500_000; // une ligne D1 est limitée à 2 Mo

export async function getStoredThumbnail(videoId: string) {
  const row = await db()
    .prepare("SELECT content_type, data FROM thumbnails WHERE video_id = ?1")
    .bind(videoId)
    .first<{ content_type: string; data: ArrayBuffer | number[] }>();
  if (!row) return null;
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return { contentType: row.content_type, bytes };
}

/** Adresse TikTok utilisable par oEmbed (certains liens partagés n'ont pas de pseudo : « /@/video/… »). */
function canonicalUrl(video: Video) {
  if (video.platform === "tiktok" && video.url.includes("/@/") && video.author) {
    return `https://www.tiktok.com/@${video.author}/video/${video.externalId}`;
  }
  return video.url;
}

/** Télécharge la vignette (en la renouvelant si besoin) et la conserve. Renvoie null si indisponible. */
export async function fetchAndStoreThumbnail(video: Video) {
  let url = video.thumbnail;
  if (video.platform === "tiktok" && (!url || thumbnailExpiresSoon(url))) {
    url = (await freshTikTokThumbnail(canonicalUrl(video))) ?? "";
  }
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.startsWith("image/")) {
      console.warn(`[vignette] image ${res.status} (${contentType}) pour la vidéo ${video.id}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return { contentType, bytes };
    await db()
      .prepare(
        `INSERT INTO thumbnails (video_id, content_type, data, fetched_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (video_id) DO UPDATE SET content_type = ?2, data = ?3, fetched_at = ?4`,
      )
      .bind(video.id, contentType, bytes, new Date().toISOString())
      .run();
    return { contentType, bytes };
  } catch (e) {
    console.warn(`[vignette] téléchargement en échec pour la vidéo ${video.id} : ${(e as Error).message}`);
    return null;
  }
}
