// Drop : kanban, statuts et positions après un glisser-déposer.
import { currentUser } from "@/lib/accounts";
import { reorderSchema } from "@/drop/inputs";
import { reorderTasks } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, reorderSchema);
  if ("response" in parsed) return parsed.response;
  const ok = await reorderTasks(user.id, (await params).id, parsed.data.items);
  return ok ? Response.json({ ok: true }) : notFound();
}
