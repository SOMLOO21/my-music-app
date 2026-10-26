// Réservé à l'équipe (protégé par le mot de passe du site) : liste des artistes inscrits
// et réinitialisation de mot de passe.
import { listUsers, resetPassword } from "@/lib/accounts";

export async function GET() {
  return Response.json(await listUsers());
}

export async function POST(req: Request) {
  const { userId, password } = (await req.json()) as { userId?: string; password?: string };
  if (!userId || !password || password.length < 6) {
    return Response.json({ error: "Le mot de passe doit faire au moins 6 caractères." }, { status: 400 });
  }
  await resetPassword(userId, password);
  return Response.json({ ok: true });
}
