// Drop : lien public en lecture seule (propriétaire). GET : lien actif ; POST : créer ou régénérer ; DELETE : désactiver.
import { currentUser } from "@/lib/accounts";
import { createShareLink, disableShareLink, getShareLink } from "@/drop/repo";
import { notFound, unauthorized } from "@/drop/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const link = await getShareLink(user.id, (await params).id);
  return link === false ? notFound() : Response.json({ link });
}

export async function POST(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const link = await createShareLink(user.id, (await params).id);
  return link ? Response.json({ link }, { status: 201 }) : notFound();
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  return (await disableShareLink(user.id, (await params).id)) ? Response.json({ link: null }) : notFound();
}
