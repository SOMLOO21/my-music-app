import { addFavorites, checkLogin, getFavorites, startSession, type FavoriteMap } from "@/lib/accounts";

export async function POST(req: Request) {
  const body = (await req.json()) as { pseudo?: string; password?: string; favorites?: FavoriteMap };
  const user = await checkLogin(String(body.pseudo ?? ""), String(body.password ?? ""));
  if (!user) return Response.json({ error: "Pseudo ou mot de passe incorrect." }, { status: 401 });

  await addFavorites(user.id, body.favorites ?? {});
  return Response.json(
    { user, favorites: await getFavorites(user.id) },
    { headers: { "Set-Cookie": await startSession(user.id) } },
  );
}
