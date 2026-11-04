import Link from "next/link";
import Admin from "@/components/Admin";
import Artists from "@/components/Artists";
import Header from "@/components/Header";
import { getTaxonomy, listVideos } from "@/lib/db";

export const dynamic = "force-dynamic";

// Deux onglets : la configuration des vidéos d'Inspire et les artistes inscrits.
const TABS = [
  { key: "videos", label: "Vidéos" },
  { key: "artistes", label: "Artistes inscrits" },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string; onglet?: string }> }) {
  const { edit, onglet } = await searchParams;
  const tab = onglet === "artistes" && !edit ? "artistes" : "videos";
  const [videos, taxonomy] = tab === "videos" ? await Promise.all([listVideos(), getTaxonomy()]) : [[], null];
  return (
    <>
      <Header title="Espace admin" backHref="/inspire" />
      <nav className="mx-auto flex max-w-5xl gap-2 px-4 pb-2 pt-4" aria-label="Sections de l'admin">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "videos" ? "/admin" : "/admin?onglet=artistes"}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? "bg-accent text-black" : "border border-white/15 text-white/70 hover:border-white/40 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href="/admin/drop"
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white"
        >
          Drop
        </Link>
      </nav>
      {tab === "videos" ? <Admin initialVideos={videos} initialTaxonomy={taxonomy!} initialEditId={edit} /> : <Artists />}
    </>
  );
}
