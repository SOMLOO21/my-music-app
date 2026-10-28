// Stockage : base Turso (SQLite), voir ./sql.ts. Structure dans migrations/ (npm run db:migrate).
import { sql } from "./sql";
import { FACETS, type FacetKey, type Taxonomy, type Video } from "./types";

const db = () => sql;

export const SEED_TAXONOMY: Taxonomy = {
  // Formats issus du benchmark TikTok Mymusicads.
  type: [
    "Cover", "Version acoustique", "Instrument face caméra", "Instrument sans se montrer", "DJ mix / mashup",
    "Lipsync", "Teaser de sortie", "Performance studio", "Processus de création", "Duo", "Hit the high notes",
    "Open verse", "Transition", "Challenge de danse", "Challenge drôle", "Fusion créative", "Extrait de clip",
    "Live", "Backstage de clip", "Réaction à une sortie", "Lyrics speed up", "Hook", "Promo",
  ],
  genre: ["Rap", "Pop", "R&B", "Afro", "Reggae", "Jazz", "Électro", "Rock", "Variété"],
  style: ["Face caméra", "Sans se montrer", "Texte à l'écran", "Plan fixe", "Clip", "Duo / collab", "Écran vert"],
  hook: ["Question", "Avant / après", "Réaction", "Storytelling", "Défi", "Extrait du son"],
  lieu: ["Studio", "Home studio", "Chambre", "Extérieur / rue", "Scène", "Voiture"],
};

// --- Filtres -----------------------------------------------------------------

export async function getTaxonomy(): Promise<Taxonomy> {
  const { results } = await db().prepare("SELECT facet, vals FROM taxonomy").all<{ facet: FacetKey; vals: string }>();
  const taxonomy = structuredClone(SEED_TAXONOMY);
  for (const row of results) if (row.facet in taxonomy) taxonomy[row.facet] = JSON.parse(row.vals);
  return taxonomy;
}

export async function addTaxonomyValue(facet: FacetKey, label: string): Promise<Taxonomy> {
  const taxonomy = await getTaxonomy();
  if (!taxonomy[facet].some((v) => v.toLowerCase() === label.toLowerCase())) {
    taxonomy[facet].push(label);
    await db()
      .prepare("INSERT INTO taxonomy (facet, vals) VALUES (?1, ?2) ON CONFLICT (facet) DO UPDATE SET vals = ?2")
      .bind(facet, JSON.stringify(taxonomy[facet]))
      .run();
  }
  return taxonomy;
}

export const isFacet = (key: unknown): key is FacetKey => FACETS.some((f) => f.key === key);

// --- Vidéos ------------------------------------------------------------------

const parse = (rows: { data: string }[]) =>
  rows.map((r) => {
    const v = JSON.parse(r.data) as Video;
    v.status ??= "published";
    return v;
  });

/** Toutes les vidéos, les plus récentes d'abord. */
export async function listVideos(status?: Video["status"]): Promise<Video[]> {
  const stmt = status
    ? db().prepare("SELECT data FROM videos WHERE status = ?1 ORDER BY created_at DESC").bind(status)
    : db().prepare("SELECT data FROM videos ORDER BY created_at DESC");
  return parse((await stmt.all<{ data: string }>()).results);
}

export async function getVideo(id: string): Promise<Video | null> {
  const row = await db().prepare("SELECT data FROM videos WHERE id = ?1").bind(id).first<{ data: string }>();
  return row ? parse([row])[0] : null;
}

export async function findDuplicate(link: Pick<Video, "platform" | "externalId">): Promise<Video | null> {
  const row = await db()
    .prepare("SELECT data FROM videos WHERE platform = ?1 AND external_id = ?2")
    .bind(link.platform, link.externalId)
    .first<{ data: string }>();
  return row ? parse([row])[0] : null;
}

/** Insère ou remplace une vidéo. */
export async function saveVideo(v: Video) {
  await db()
    .prepare(
      `INSERT INTO videos (id, platform, external_id, status, created_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (id) DO UPDATE SET status = ?4, data = ?6`,
    )
    .bind(v.id, v.platform, v.externalId, v.status, v.createdAt, JSON.stringify(v))
    .run();
}

export async function deleteVideo(id: string) {
  await db().prepare("DELETE FROM videos WHERE id = ?1").bind(id).run();
}
