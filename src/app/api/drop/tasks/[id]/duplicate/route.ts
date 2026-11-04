// Drop : dupliquer une tâche (propriétaire ou éditeur).
import { currentUser } from "@/lib/accounts";
import { duplicateTask } from "@/drop/repo";
import { notFound, unauthorized } from "@/drop/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const task = await duplicateTask(user.id, (await params).id);
  return task ? Response.json(task, { status: 201 }) : notFound("Tâche");
}
