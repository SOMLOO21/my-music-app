// Drop : paramètres de la sortie (propriétaire). ?apercu=1 calcule le recalage sans rien enregistrer.
import { currentUser } from "@/lib/accounts";
import { settingsChangeSchema } from "@/drop/inputs";
import { applySettings, previewSettings } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, settingsChangeSchema);
  if ("response" in parsed) return parsed.response;
  const id = (await params).id;
  const preview = new URL(req.url).searchParams.get("apercu") === "1";
  const result = preview ? await previewSettings(user.id, id, parsed.data) : await applySettings(user.id, id, parsed.data);
  return result ? Response.json(result) : notFound();
}
