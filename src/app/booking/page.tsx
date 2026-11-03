import Link from "next/link";
import Shell from "@/components/booking/Shell";
import { card } from "@/components/booking/styles";
import { getProfile, listContacts, listFollowupsDue, listVenues } from "@/booking/repo";
import { isAdminSession, pageUser } from "@/booking/session";
import { STATUS_LABELS } from "@/booking/types";

export const dynamic = "force-dynamic";

/** Accueil de Booking : relances du jour, profil à compléter, raccourcis. */
export default async function BookingHome() {
  const user = await pageUser("/booking");
  const [profile, due, contacts, privateVenues, admin] = await Promise.all([
    getProfile(user.id),
    listFollowupsDue(user.id),
    listContacts(user.id),
    listVenues(user.id, { privateOnly: true, limit: 200 }),
    isAdminSession(user),
  ]);
  const profileReady = Boolean(profile?.stage_name && profile?.style);

  return (
    <Shell title="Booking" tab="accueil" adminAs={admin ? user.pseudo : null}>
      <p className="mb-5 text-lg">Salut {user.firstName} 🎤</p>

      {!profileReady && (
        <Link href="/booking/profil" className={`${card} mb-5 block border-accent/60`}>
          <p className="font-semibold">Commence par ton profil booking</p>
          <p className="mt-1 text-sm text-white/60">
            Ton nom de scène, ton style et tes liens (EPK, live, smart link) se remplissent une fois et alimentent tous tes mails.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-accent">Remplir mon profil →</span>
        </Link>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">À relancer aujourd&apos;hui</h2>
        {due.length === 0 ? (
          <p className={`${card} text-sm text-white/50`}>
            Rien à relancer pour l&apos;instant. Les relances apparaissent ici toutes seules, {profile?.followup_days ?? 10} jours
            après ta dernière action sur un lieu.
          </p>
        ) : (
          <ul className="space-y-2">
            {due.map((o) => (
              <li key={o.id} className={`${card} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <Link href={`/booking/lieux/${o.venue_id}`} className="block truncate font-medium hover:underline">
                    {o.venue_name}
                  </Link>
                  <p className="text-xs text-white/50">
                    {o.venue_city ?? "Ville inconnue"} · {STATUS_LABELS[o.status]} · prévue le{" "}
                    {new Date(`${o.due_on}T12:00:00`).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/booking/annuaire" className={`${card} hover:border-white/30`}>
          <p className="text-2xl">🗺️</p>
          <p className="mt-2 font-semibold">Annuaire des lieux</p>
          <p className="text-sm text-white/60">Salles, clubs, caves de jazz, festivals… filtrés par style, ville et jauge.</p>
        </Link>
        <Link href="/booking/contacts" className={`${card} hover:border-white/30`}>
          <p className="text-2xl">📇</p>
          <p className="mt-2 font-semibold">Mes contacts ({contacts.length})</p>
          <p className="text-sm text-white/60">
            Tes contacts restent privés{privateVenues.length ? ` · ${privateVenues.length} lieu(x) ajouté(s) par toi` : ""}.
          </p>
        </Link>
        <Link href="/booking/import" className={`${card} hover:border-white/30`}>
          <p className="text-2xl">📥</p>
          <p className="mt-2 font-semibold">Importer mon fichier</p>
          <p className="text-sm text-white/60">Ton tableau Excel ou CSV de lieux et de suivi, repris en 2 minutes.</p>
        </Link>
        <div className={`${card} border-dashed text-white/40`}>
          <p className="font-semibold">Bientôt</p>
          <p className="text-sm">Campagnes, mails prêts à envoyer et pipeline.</p>
        </div>
      </div>
    </Shell>
  );
}
