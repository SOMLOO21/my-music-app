import Feed from "@/components/Feed";
import { currentUser, getFavorites } from "@/lib/accounts";
import { getTaxonomy, listVideos } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ favoris?: string }> }) {
  const [{ favoris }, videos, taxonomy, user] = await Promise.all([searchParams, listVideos(), getTaxonomy(), currentUser()]);
  return (
    <Feed
      initialVideos={videos.filter((v) => v.status === "published")}
      draftCount={videos.filter((v) => v.status === "draft").length}
      taxonomy={taxonomy}
      user={user && { pseudo: user.pseudo, firstName: user.firstName }}
      initialFavorites={user ? await getFavorites(user.id) : {}}
      showFavorites={favoris === "1"}
    />
  );
}
