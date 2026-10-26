import Account from "@/components/Account";
import Header from "@/components/Header";
import { currentUser, getFavorites } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  const favoriteCount = user ? Object.keys(await getFavorites(user.id)).length : 0;
  return (
    <>
      <Header title={user ? "Mon compte" : "Connexion"} />
      <Account user={user} favoriteCount={favoriteCount} />
    </>
  );
}
