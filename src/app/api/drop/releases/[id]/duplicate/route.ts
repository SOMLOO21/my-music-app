// Drop : dupliquer une sortie (propriétaire) pour repartir de la même structure.
import { currentUser } from "@/lib/accounts";
import { duplicateRelease } from "@/drop/repo";
import { notFound, unauthorized } from "@/drop/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const copy = await duplicateRelease(user.id, (await params).id);
  return copy ? Response.json({ id: copy.release.id }, { status: 201 }) : notFound();
}
