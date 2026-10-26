// Analyse d'un lien collé : plateforme, identifiant, URL d'intégration et métadonnées.
import type { ResolvedLink } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function resolveLink(raw: string): Promise<ResolvedLink> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Ce n'est pas un lien valide.");
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return resolveTikTok(url.toString());
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return resolveInstagram(url);
  throw new Error("Seuls les liens TikTok et Instagram sont acceptés.");
}

const tiktokId = (u: string) => u.match(/\/video\/(\d+)/)?.[1];

async function resolveTikTok(input: string): Promise<ResolvedLink> {
  let canonical = input.split("?")[0];
  let id = tiktokId(canonical);

  // Liens courts (vm.tiktok.com, tiktok.com/t/...) : on suit la redirection.
  if (!id) {
    const res = await fetch(input, { redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    canonical = res.url.split("?")[0];
    id = tiktokId(canonical);
  }

  let meta: { title?: string; author_name?: string; author_url?: string; thumbnail_url?: string; embed_product_id?: string } = {};
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) meta = await res.json();
  } catch {
    // Les métadonnées sont un bonus : on continue sans.
  }
  id ??= meta.embed_product_id;
  if (!id) throw new Error("Impossible de trouver la vidéo TikTok (lien de photo ou vidéo privée ?).");

  // oEmbed incomplet (cela arrive quand TikTok limite les demandes) : on complète avec la page.
  if (!meta.thumbnail_url || !meta.author_name) {
    const page = await tiktokPageInfo(canonical);
    meta.thumbnail_url ??= page.cover;
    meta.title ??= page.desc;
    if (page.uniqueId && canonical.includes("/@/")) canonical = canonical.replace("/@/", `/@${page.uniqueId}/`);
    meta.author_url ??= page.uniqueId ? `https://www.tiktok.com/@${page.uniqueId}` : undefined;
  }

  return {
    platform: "tiktok",
    url: canonical,
    externalId: id,
    embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0&music_info=1&description=1`,
    title: meta.title ?? "",
    // Le pseudo (@handle) est plus utile que le nom d'affichage pour retrouver le créateur.
    author: (meta.author_url ?? canonical).match(/\/@([^/?]+)/)?.[1] ?? meta.author_name ?? "",
    thumbnail: meta.thumbnail_url ?? "",
  };
}

async function resolveInstagram(url: URL): Promise<ResolvedLink> {
  const match = url.pathname.match(/\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Lien Instagram non reconnu (il faut un lien de Reel ou de post).");
  const kind = match[1] === "reels" ? "reel" : match[1];
  const code = match[2];
  const canonical = `https://www.instagram.com/${kind}/${code}/`;

  // Instagram ne fournit pas de métadonnées sans clé d'API : on tente les balises og:, sans garantie.
  let title = "";
  let author = "";
  let thumbnail = "";
  try {
    const res = await fetch(canonical, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const html = await res.text();
      const og = (p: string) =>
        decodeEntities(html.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`))?.[1] ?? "");
      thumbnail = og("image");
      const ogTitle = og("title");
      author = ogTitle.match(/^(.+?) on Instagram/)?.[1] ?? ogTitle.match(/^(.+?) sur Instagram/)?.[1] ?? "";
      title = og("description").replace(/^.*?:\s*"?/, "").replace(/"\.?$/, "");
    }
  } catch {
    // Pas de métadonnées : l'équipe pourra saisir un titre à la main.
  }

  return {
    platform: "instagram",
    url: canonical,
    externalId: code,
    embedUrl: `${canonical}embed/`,
    title,
    author,
    thumbnail,
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Secours quand oEmbed ne renvoie pas tout : la page publique de la vidéo contient
 * la couverture, la légende et le pseudo. */
async function tiktokPageInfo(videoUrl: string) {
  try {
    const res = await fetch(videoUrl, {
      headers: { "user-agent": UA, "accept-language": "fr-FR,fr" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    const field = (name: string) => {
      const m = html.match(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`));
      if (!m) return undefined;
      try {
        return JSON.parse(`"${m[1]}"`) as string;
      } catch {
        return undefined;
      }
    };
    return { cover: field("cover") ?? field("originCover"), desc: field("desc"), uniqueId: field("uniqueId") };
  } catch {
    return {};
  }
}

/** Vignette TikTok fraîche (les liens d'image de TikTok expirent au bout de quelques jours). */
export async function freshTikTokThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[vignette] oEmbed ${res.status} pour ${videoUrl} : ${text.slice(0, 80)}`);
      return null;
    }
    const meta = JSON.parse(text) as { thumbnail_url?: string };
    if (meta.thumbnail_url) return meta.thumbnail_url;
    const cover = (await tiktokPageInfo(videoUrl)).cover;
    if (!cover) console.warn(`[vignette] aucune vignette trouvée pour ${videoUrl}`);
    return cover ?? null;
  } catch (e) {
    console.warn(`[vignette] oEmbed en échec pour ${videoUrl} : ${(e as Error).message}`);
    return null;
  }
}

/** Vrai si le lien d'image TikTok expire dans moins d'une heure (paramètre x-expires). */
export function thumbnailExpiresSoon(url: string) {
  const expires = Number(url.match(/[?&]x-expires=(\d+)/)?.[1]);
  return Number.isFinite(expires) && expires * 1000 < Date.now() + 3_600_000;
}
