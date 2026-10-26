import { addTaxonomyValue, getTaxonomy, isFacet } from "@/lib/db";

export async function GET() {
  return Response.json(await getTaxonomy());
}

/** Ajoute une valeur à un filtre (ex. un nouveau genre musical). */
export async function POST(req: Request) {
  const { facet, value } = (await req.json()) as { facet?: string; value?: string };
  const label = String(value ?? "").trim();
  if (!isFacet(facet) || !label) return Response.json({ error: "Valeur invalide." }, { status: 400 });
  return Response.json(await addTaxonomyValue(facet, label));
}
