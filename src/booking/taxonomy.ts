// Booking : listes (types de lieu, esthétiques, formats, types de deal, canaux, libellés des statuts).
// Lisibles par tous ; modifiables seulement par l'équipe (setTaxonomyFacet dans admin-repo.ts).
import { sql } from "@/lib/sql";
import { STATUS_LABELS, type BookingFacet, type BookingTaxonomy } from "./types";

export async function getBookingTaxonomy(): Promise<BookingTaxonomy> {
  const { results } = await sql.prepare("SELECT facet, vals FROM bk_taxonomy").all<{ facet: BookingFacet; vals: string }>();
  const taxonomy: BookingTaxonomy = { venue_type: [], genre: [], usual_format: [], deal_type: [], channel: [], status: { ...STATUS_LABELS } };
  for (const row of results) {
    if (!(row.facet in taxonomy)) continue;
    let vals: unknown = null;
    try {
      vals = JSON.parse(row.vals);
    } catch {}
    if (row.facet === "status") Object.assign(taxonomy.status, vals ?? {});
    else if (Array.isArray(vals)) (taxonomy as unknown as Record<string, unknown>)[row.facet] = vals;
  }
  return taxonomy;
}

/** Esthétiques à plat, sous-genres compris (« Électro », « Techno », « House »…). */
export const flatGenres = (taxonomy: BookingTaxonomy) => taxonomy.genre.flatMap((g) => [g.label, ...g.sub]);
