import WizardLoader from "@/components/drop/WizardLoader";
import { sql } from "@/lib/sql";
import { pageUser } from "@/drop/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle sortie · Drop" };

/** Assistant de création d'une sortie. */
export default async function NewRelease() {
  const user = await pageUser("/drop/nouvelle");
  // Nom d'artiste de la dernière sortie, pour éviter de le retaper.
  const last = await sql
    .prepare("SELECT artist_name FROM drop_releases WHERE owner_id = ?1 ORDER BY created_at DESC LIMIT 1")
    .bind(user.id)
    .first<{ artist_name: string }>();
  return <WizardLoader defaultArtist={last?.artist_name ?? ""} />;
}
