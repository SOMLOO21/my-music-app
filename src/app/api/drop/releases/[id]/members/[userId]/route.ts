// Drop : changer le rôle d'un invité ou le retirer (propriétaire).
import { currentUser } from "@/lib/accounts";
import { memberRoleSchema } from "@/drop/inputs";
import { listMembers, removeMember, setMemberRole } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, memberRoleSchema);
  if ("response" in parsed) return parsed.response;
  const { id, userId } = await params;
  if (!(await setMemberRole(user.id, id, userId, parsed.data.role))) return notFound();
  return Response.json({ members: await listMembers(user.id, id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id, userId } = await params;
  if (!(await removeMember(user.id, id, userId))) return notFound();
  return Response.json({ members: await listMembers(user.id, id) });
}
