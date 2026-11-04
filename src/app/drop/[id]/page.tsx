import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReleaseApp, { type ReleaseTab } from "@/components/drop/ReleaseApp";
import Shell from "@/components/drop/Shell";
import { todayInParis } from "@/drop/engine/dates";
import { getRelease } from "@/drop/repo";
import { isAdminSession, pageUser } from "@/drop/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ma sortie · Drop" };

const TABS: ReleaseTab[] = ["feuille", "kanban", "calendrier", "parametres"];

/** Une sortie : feuille de route, kanban, calendrier, paramètres. */
export default async function ReleasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const { id } = await params;
  const { vue } = await searchParams;
  const user = await pageUser(`/drop/${id}`);
  const view = await getRelease(user.id, id);
  if (!view) notFound();
  const tab = TABS.includes(vue as ReleaseTab) ? (vue as ReleaseTab) : "feuille";

  return (
    <Shell wide title={view.release.title} backHref="/drop" adminAs={(await isAdminSession(user)) ? user.pseudo : null}>
      <ReleaseApp view={view} today={todayInParis()} initialTab={tab} />
    </Shell>
  );
}
