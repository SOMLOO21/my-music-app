import Directory from "@/components/booking/Directory";
import Shell from "@/components/booking/Shell";
import { flatGenres, getBookingTaxonomy } from "@/booking/taxonomy";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const user = await pageUser("/booking/annuaire");
  const [taxonomy, admin] = await Promise.all([getBookingTaxonomy(), isAdminSession(user)]);
  return (
    <Shell title="Annuaire des lieux" tab="annuaire" adminAs={admin ? user.pseudo : null} backHref="/booking">
      <Directory venueTypes={taxonomy.venue_type} genres={flatGenres(taxonomy)} formats={taxonomy.usual_format} />
    </Shell>
  );
}
