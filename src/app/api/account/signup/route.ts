import { addFavorites, createUser, getFavorites, startSession, validateSignup, type FavoriteMap } from "@/lib/accounts";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    firstName?: string;
    lastName?: string;
    pseudo?: string;
    password?: string;
    favorites?: FavoriteMap;
  };
  const data = validateSignup(body);
  if ("error" in data) return Response.json({ error: data.error }, { status: 400 });

  const created = await createUser(data);
  if ("error" in created) return Response.json({ error: created.error }, { status: 409 });

  // Les favoris ajoutés avant l'inscription (sur cet appareil) rejoignent le compte.
  await addFavorites(created.user.id, body.favorites ?? {});
  return Response.json(
    { user: created.user, favorites: await getFavorites(created.user.id) },
    { status: 201, headers: { "Set-Cookie": await startSession(created.user.id) } },
  );
}
