// Booking : un lieu (visible par l'artiste) ; modification et suppression de ses lieux privés uniquement.
import { currentUser } from "@/lib/accounts";
import { venueInput } from "@/booking/inputs";
import { deletePrivateVenue, getVenue, updatePrivateVenue } from "@/booking/repo";
import { body, notFound, unauthorized } from "@/booking/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const venue = await getVenue(user.id, (await params).id);
  return venue ? Response.json(venue) : notFound("Lieu");
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const venue = await updatePrivateVenue(user.id, (await params).id, venueInput(await body(req)));
  return venue ? Response.json(venue) : notFound("Lieu");
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  return (await deletePrivateVenue(user.id, (await params).id)) ? Response.json({ ok: true }) : notFound("Lieu");
}
