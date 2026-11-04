// Drop : sorties de l'artiste connecté (liste, création avec génération du planning).
import { currentUser } from "@/lib/accounts";
import { releaseCreateSchema } from "@/drop/inputs";
import { createRelease, listReleases } from "@/drop/repo";
import { parseBody, unauthorized } from "@/drop/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(await listReleases(user.id));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = await parseBody(req, releaseCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { release, plan } = await createRelease(user.id, parsed.data);
  return Response.json({ id: release.id, mode: plan.mode, tasks: plan.tasks.length }, { status: 201 });
}
