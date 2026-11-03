// Booking : annuaire (lieux partagés publiés + lieux privés de l'artiste) et création d'un lieu privé.
import { currentUser } from "@/lib/accounts";
import { capacityRange } from "@/booking/geo";
import { venueInput } from "@/booking/inputs";
import { createPrivateVenue, listVenues } from "@/booking/repo";
import { badRequest, body, unauthorized } from "@/booking/session";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const p = new URL(req.url).searchParams;
  const get = (k: string) => p.get(k)?.trim() || undefined;
  const range = capacityRange(get("jauge"));
  const limit = 30;
  const venues = await listVenues(user.id, {
    q: get("q"),
    type: get("type"),
    genre: get("genre"),
    city: get("ville"),
    department: get("departement"),
    region: get("region"),
    format: get("format"),
    capacityMin: range?.min,
    capacityMax: range?.max,
    privateOnly: p.get("prives") === "1",
    limit: limit + 1,
    offset: Number(p.get("offset")) || 0,
  });
  return Response.json({ venues: venues.slice(0, limit), more: venues.length > limit });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const input = venueInput(await body(req));
  if (!input.name?.trim()) return badRequest("Indique le nom du lieu.");
  const venue = await createPrivateVenue(user.id, { ...input, name: input.name });
  return Response.json(venue, { status: 201 });
}
