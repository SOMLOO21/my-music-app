// Drop : ajout d'une tâche personnalisée (propriétaire ou éditeur).
import { currentUser } from "@/lib/accounts";
import { taskCreateSchema } from "@/drop/inputs";
import { createTask } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, taskCreateSchema);
  if ("response" in parsed) return parsed.response;
  const task = await createTask(user.id, (await params).id, parsed.data);
  return task ? Response.json(task, { status: 201 }) : notFound();
}
