// Booking : rapport de rapprochement d'un fichier importé (rien n'est enregistré).
import { currentUser } from "@/lib/accounts";
import { ImportError, previewImport, readPayload } from "@/booking/importer";
import { badRequest, body, unauthorized } from "@/booking/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json(await previewImport(user.id, readPayload(await body(req))));
  } catch (e) {
    if (e instanceof ImportError) return badRequest(e.message);
    console.error("[booking] aperçu d'import :", e);
    return Response.json({ error: "L'analyse du fichier a échoué. Réessaie, ou envoie le fichier à l'équipe." }, { status: 500 });
  }
}
