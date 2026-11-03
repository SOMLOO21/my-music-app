import { notFound } from "next/navigation";
import Shell from "@/components/booking/Shell";
import VenueContacts from "@/components/booking/VenueContacts";
import { card, secondary } from "@/components/booking/styles";
import { getVenue, listContacts } from "@/booking/repo";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

const link = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const instagramUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, "")}`);

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser(`/booking/lieux/${id}`);
  const venue = await getVenue(user.id, id);
  if (!venue) notFound();
  const [contacts, admin] = await Promise.all([listContacts(user.id, { venueId: venue.id }), isAdminSession(user)]);

  const rows: [string, React.ReactNode][] = [
    ["Type", venue.type],
    ["Esthétiques", venue.genres.join(" · ")],
    ["Lieu", [venue.city, venue.department, venue.region].filter(Boolean).join(" · ")],
    ["Jauge", venue.capacity ? `${venue.capacity} places` : null],
    ["Format habituel", venue.usual_format],
    ["Bouclage de la programmation", venue.booking_period],
    [
      "Site",
      venue.website && (
        <a href={link(venue.website)} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
          {venue.website}
        </a>
      ),
    ],
    [
      "Instagram",
      venue.instagram && (
        <a href={instagramUrl(venue.instagram)} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
          {venue.instagram}
        </a>
      ),
    ],
  ];

  return (
    <Shell title={venue.name} adminAs={admin ? user.pseudo : null} backHref="/booking/annuaire">
      <div className={`${card} mb-4`}>
        {venue.owner_user_id && (
          <p className="mb-3 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
            Lieu privé : visible seulement par toi
          </p>
        )}
        <dl className="space-y-3">
          {rows
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-white/50">{key}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
        </dl>
        {venue.public_notes && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-white/5 p-3 text-sm text-white/80">
            <span className="mb-1 block text-xs font-semibold text-white/50">Le mot de l&apos;équipe Mymusicads</span>
            {venue.public_notes}
          </p>
        )}
        {venue.verified_at && (
          <p className="mt-3 text-xs text-white/40">Infos vérifiées le {new Date(venue.verified_at).toLocaleDateString("fr-FR")}</p>
        )}
      </div>

      <button type="button" disabled className={`${secondary} mb-6 w-full`} title="Disponible avec les campagnes">
        Ajouter à une campagne · bientôt
      </button>

      <VenueContacts venueId={venue.id} initial={contacts} privateVenue={Boolean(venue.owner_user_id)} />
    </Shell>
  );
}
