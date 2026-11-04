// Drop : modification d'une tâche (statut, date, notes…) par le propriétaire ou un éditeur ; suppression par le propriétaire.
import { currentUser } from "@/lib/accounts";
import { taskPatchSchema } from "@/drop/inputs";
import { deleteTask, updateTask } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, taskPatchSchema);
  if ("response" in parsed) return parsed.response;
  const task = await updateTask(user.id, (await params).id, parsed.data);
  return task ? Response.json(task) : notFound("Tâche");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  return (await deleteTask(user.id, (await params).id)) ? Response.json({ ok: true }) : notFound("Tâche");
}
