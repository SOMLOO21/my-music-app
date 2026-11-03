import Link from "next/link";
import Header from "@/components/Header";

const NAV = [
  { key: "accueil", label: "Accueil", href: "/booking" },
  { key: "annuaire", label: "Annuaire", href: "/booking/annuaire" },
  { key: "contacts", label: "Mes contacts", href: "/booking/contacts" },
  { key: "profil", label: "Mon profil", href: "/booking/profil" },
] as const;

export type BookingTab = (typeof NAV)[number]["key"];

/** Cadre des pages Booking : titre, bandeau « Mode admin », onglets. */
export default function Shell({
  title,
  tab,
  adminAs,
  backHref = "/",
  children,
}: {
  title: string;
  tab?: BookingTab;
  /** Pseudo de l'artiste quand l'équipe a ouvert son compte depuis /admin. */
  adminAs?: string | null;
  backHref?: string;
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
      <nav className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pt-4" aria-label="Sections de Booking">
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            aria-current={tab === n.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === n.key ? "bg-accent text-black" : "border border-white/15 text-white/70 hover:border-white/40 hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-5">{children}</main>
    </>
  );
}
