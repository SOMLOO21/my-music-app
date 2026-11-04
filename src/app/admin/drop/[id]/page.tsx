import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import ReleaseApp from "@/components/drop/ReleaseApp";
import { getReleaseAsAdmin } from "@/drop/admin-repo";
import { todayInParis } from "@/drop/engine/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sortie · Admin Drop" };

/** Admin Mymusicads : une sortie en lecture seule (notes et liens compris). */
export default async function AdminDropRelease({ params }: { params: Promise<{ id: string }> }) {
  const view = await getReleaseAsAdmin((await params).id);
  if (!view) notFound();
  return (
    <>
      <Header title={`Admin · ${view.release.title}`} backHref="/admin/drop" />
      <p className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-black">🛠 Lecture seule : rien n&apos;est modifiable depuis l&apos;admin.</p>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">
        <ReleaseApp view={view} today={todayInParis()} initialTab="feuille" />
      </main>
    </>
  );
}
