export const FACETS = [
  { key: "type", label: "Type de contenu" },
  { key: "genre", label: "Genre musical" },
  { key: "style", label: "Style de vidéo" },
  { key: "hook", label: "Style de hook" },
  { key: "lieu", label: "Lieu de tournage" },
] as const;

export type FacetKey = (typeof FACETS)[number]["key"];
export type Tags = Record<FacetKey, string[]>;
export type Taxonomy = Record<FacetKey, string[]>;
export type Platform = "tiktok" | "instagram";

/** Ce que l'on sait d'un lien TikTok / Instagram après analyse. */
export interface ResolvedLink {
  platform: Platform;
  url: string;
  embedUrl: string;
  externalId: string;
  title: string;
  author: string;
  thumbnail: string;
}

/** « draft » : reçue depuis le partage TikTok/Instagram, à taguer avant d'apparaître dans le fil. */
export type VideoStatus = "draft" | "published";

export interface Video extends ResolvedLink {
  id: string;
  status: VideoStatus;
  /** Origine des tags pré-remplis à la réception : IA ou règles simples. */
  suggestedBy?: "ai" | "rules";
  comment: string;
  tags: Tags;
  createdAt: string;
  /** Favori : uniquement côté navigateur (stockage local), jamais en base. */
  favoritedAt?: string | null;
}

export const emptyTags = (): Tags => ({ type: [], genre: [], style: [], hook: [], lieu: [] });

export function sanitizeTags(input: unknown): Tags {
  const tags = emptyTags();
  if (!input || typeof input !== "object") return tags;
  for (const { key } of FACETS) {
    const values = (input as Record<string, unknown>)[key];
    if (Array.isArray(values)) tags[key] = values.filter((v): v is string => typeof v === "string");
  }
  return tags;
}

export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram" };
