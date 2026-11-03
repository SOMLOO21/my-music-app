// Booking : listes (types de lieu, esthétiques, formats…), lisibles par les artistes connectés.
import { currentUser } from "@/lib/accounts";
import { getBookingTaxonomy } from "@/booking/taxonomy";
import { unauthorized } from "@/booking/session";

export async function GET() {
  if (!(await currentUser())) return unauthorized();
  return Response.json(await getBookingTaxonomy());
}
