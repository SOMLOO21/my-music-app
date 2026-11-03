import { headers } from "next/headers";
import ProfileForm from "@/components/booking/ProfileForm";
import Shell from "@/components/booking/Shell";
import { getProfile, listSmartLinks } from "@/booking/repo";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

export default async function BookingProfilePage() {
  const user = await pageUser("/booking/profil");
  const [profile, links, admin, h] = await Promise.all([getProfile(user.id), listSmartLinks(user.id), isAdminSession(user), headers()]);
  // Adresse publique des smart links (/l/<titre>) sur ce site
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <Shell title="Mon profil booking" tab="profil" adminAs={admin ? user.pseudo : null} backHref="/booking">
      <ProfileForm
        initial={profile}
        smartLinks={links.map((l) => ({ label: `${l.title} – ${l.artist}`, url: `${origin}/l/${l.slug}` }))}
      />
    </Shell>
  );
}
