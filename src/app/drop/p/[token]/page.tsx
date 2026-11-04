import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicRelease from "@/components/drop/PublicRelease";
import { todayInParis } from "@/drop/engine/dates";
import { getPublicRelease } from "@/drop/repo";

export const dynamic = "force-dynamic";
// Page publique : jamais indexée, et le lien (qui contient le jeton) n'est pas transmis aux sites ouverts depuis la page.
export const metadata: Metadata = {
  title: "Planning de sortie · Drop",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Page publique d'une sortie : le serveur vérifie le jeton et n'envoie que les champs autorisés. */
export default async function PublicReleasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicRelease(token);
  if (!data) notFound();
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-background/90 px-4 py-3 backdrop-blur">
        <span className="text-lg font-semibold">
          Drop <span className="text-sm font-normal text-white/50">· My Music App</span>
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">
        <PublicRelease data={data} today={todayInParis()} />
      </main>
    </>
  );
}
