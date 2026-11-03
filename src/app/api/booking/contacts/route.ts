// Booking : contacts privés de l'artiste connecté (liste, ajout).
import { currentUser } from "@/lib/accounts";
import { CONTACT_ERRORS, recordInMaster, resolveVenueId } from "@/booking/contacts";
import { contactInput } from "@/booking/inputs";
import { createContact, listContacts } from "@/booking/repo";
import { badRequest, body, unauthorized } from "@/booking/session";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const p = new URL(req.url).searchParams;
  return Response.json(await listContacts(user.id, { venueId: p.get("lieu") ?? undefined, q: p.get("q")?.trim() || undefined }));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const b = await body(req);
  const input = contactInput(b);
  const newVenueId = await resolveVenueId(user.id, b);
  if (newVenueId !== undefined) input.venue_id = newVenueId;
  const result = await createContact(user.id, input);
  if ("error" in result) return badRequest(CONTACT_ERRORS[result.error]);
  await recordInMaster(user, result.contact);
  return Response.json(result.contact, { status: 201 });
}
