// Booking : validation d'un import (contacts, lieux privés, démarches, copie dans la base maître, en un bloc).
import { currentUser } from "@/lib/accounts";
import { ImportError, commitImport, readPayload } from "@/booking/importer";
import { badRequest, body, unauthorized } from "@/booking/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json(await commitImport(user, readPayload(await body(req))), { status: 201 });
  } catch (e) {
    if (e instanceof ImportError) return badRequest(e.message);
    console.error("[booking] import :", e);
    return Response.json({ error: "L'import n'a pas pu être enregistré. Rien n'a été modifié : réessaie dans un instant." }, { status: 500 });
  }
}
