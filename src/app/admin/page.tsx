import Admin from "@/components/Admin";
import Artists from "@/components/Artists";
import Header from "@/components/Header";
import ImportD1 from "@/components/ImportD1";
import { getTaxonomy, listVideos } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [videos, taxonomy] = await Promise.all([listVideos(), getTaxonomy()]);
  return (
    <>
      <Header title="Espace admin" backHref="/inspire" />
      {/* TEMPORAIRE : import des données Cloudflare, à retirer après la migration. */}
      <ImportD1 />
      <Admin initialVideos={videos} initialTaxonomy={taxonomy} initialEditId={edit} />
      <Artists />
    </>
  );
}
