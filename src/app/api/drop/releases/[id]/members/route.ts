// Drop : comptes invités sur une sortie (propriétaire). GET : liste ; POST : inviter par pseudo.
import { currentUser } from "@/lib/accounts";
import { inviteSchema } from "@/drop/inputs";
import { inviteMember, listMembers } from "@/drop/repo";
import { notFound, parseBody, unauthorized } from "@/drop/session";

type Ctx = { params: Promise<{ id: string }> };

const ERRORS = {
  not_found: "Aucun compte My Music App ne correspond. Tu peux copier le lien public à la place.",
  self: "C'est ton propre compte : tu as déjà tous les droits.",
};

export async function GET(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const members = await listMembers(user.id, (await params).id);
  return members ? Response.json({ members }) : notFound();
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, inviteSchema);
  if ("response" in parsed) return parsed.response;
  const result = await inviteMember(user.id, (await params).id, parsed.data.pseudo, parsed.data.role);
  if (!result) return notFound();
  if ("error" in result && result.error) return Response.json({ error: ERRORS[result.error], code: result.error }, { status: 400 });
  return Response.json(result, { status: 201 });
}

