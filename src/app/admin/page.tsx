import Admin from "@/components/Admin";
import Artists from "@/components/Artists";
import Header from "@/components/Header";
import { getTaxonomy, listVideos } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [videos, taxonomy] = await Promise.all([listVideos(), getTaxonomy()]);
  return (
    <>
      <Header title="Espace admin" backHref="/inspire" />
      <Admin initialVideos={videos} initialTaxonomy={taxonomy} initialEditId={edit} />
      <Artists />
    </>
  );
}
