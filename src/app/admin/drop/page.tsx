import type { Metadata } from "next";
import Header from "@/components/Header";
import AdminTable from "@/components/drop/AdminTable";
import { listAllReleases } from "@/drop/admin-repo";
import { todayInParis } from "@/drop/engine/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Drop · My Music App" };

/** Admin Mymusicads : toutes les sorties Drop (page protégée par le mot de passe de l'admin, src/proxy.ts). */
export default async function AdminDropPage() {
  const today = todayInParis();
  const rows = await listAllReleases(today);
  return (
    <>
      <Header title="Admin · Drop" backHref="/admin" />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5">
        <AdminTable rows={rows} today={today} />
      </main>
    </>
  );
}
