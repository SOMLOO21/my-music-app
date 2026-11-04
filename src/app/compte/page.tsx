import Account from "@/components/Account";
import Header from "@/components/Header";
import { redirect } from "next/navigation";
import { currentUser, getFavorites } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** Page de retour après connexion (?retour=/drop) : chemin interne uniquement. */
const safeReturn = (path: string | undefined) => (path && /^\/(?!\/)/.test(path) && !path.includes("\\") ? path : null);

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const [user, { retour }] = await Promise.all([currentUser(), searchParams]);
  const back = safeReturn(retour);
  if (user && back) redirect(back);
  const favoriteCount = user ? Object.keys(await getFavorites(user.id)).length : 0;
  return (
    <>
      <Header title={user ? "Mon compte" : "Connexion"} />
      <Account user={user} favoriteCount={favoriteCount} returnTo={back ?? "/"} />
    </>
  );
}
