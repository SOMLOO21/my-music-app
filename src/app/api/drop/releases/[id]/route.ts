// Drop : une sortie (lecture, suppression par le propriétaire).
import { currentUser } from "@/lib/accounts";
import { deleteRelease, getRelease } from "@/drop/repo";
import { notFound, unauthorized } from "@/drop/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const view = await getRelease(user.id, (await params).id);
  return view ? Response.json(view) : notFound();
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  return (await deleteRelease(user.id, (await params).id)) ? Response.json({ ok: true }) : notFound();
}
