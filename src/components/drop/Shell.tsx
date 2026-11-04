import Header from "@/components/Header";

/** Cadre des pages Drop : titre, bandeau « Mode admin ». */
export default function Shell({
  title,
  adminAs,
  backHref = "/",
  wide = false,
  children,
}: {
  title: string;
  /** Pseudo de l'artiste quand l'équipe a ouvert son compte depuis /admin. */
  adminAs?: string | null;
  backHref?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {adminAs && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-4 py-2 text-sm font-medium text-black">
          <span>
            🛠 Mode admin · tu es dans le compte de <b>@{adminAs}</b>
          </span>
          {/* Route serveur (pose les cookies de retour) : rechargement complet voulu */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/link/admin-exit" className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
            Revenir à l&apos;admin
          </a>
        </div>
      )}
      <Header title={title} backHref={backHref} />
      <main className={`mx-auto px-4 pb-16 pt-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>
    </>
  );
}
