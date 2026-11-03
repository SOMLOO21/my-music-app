// Booking : un contact privé de l'artiste connecté (lecture, modification, suppression).
import { currentUser } from "@/lib/accounts";
import { CONTACT_ERRORS, recordInMaster, resolveVenueId } from "@/booking/contacts";
import { contactInput } from "@/booking/inputs";
import { deleteContact, getContact, updateContact } from "@/booking/repo";
import { badRequest, body, notFound, unauthorized } from "@/booking/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const contact = await getContact(user.id, (await params).id);
  return contact ? Response.json(contact) : notFound("Contact");
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = (await params).id;
  if (!(await getContact(user.id, id))) return notFound("Contact");
  const b = await body(req);
  const input = contactInput(b);
  const newVenueId = await resolveVenueId(user.id, b);
  if (newVenueId !== undefined) input.venue_id = newVenueId;
  const result = await updateContact(user.id, id, input);
  if (!result) return notFound("Contact");
  if ("error" in result) return badRequest(CONTACT_ERRORS[result.error]);
  await recordInMaster(user, result.contact);
  return Response.json(result.contact);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  return (await deleteContact(user.id, (await params).id)) ? Response.json({ ok: true }) : notFound("Contact");
}
