import Link from "next/link";
import Importer from "@/components/booking/Importer";
import Shell from "@/components/booking/Shell";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await pageUser("/booking/import");
  const admin = await isAdminSession(user);
  return (
    <Shell title="Importer mon fichier" tab="import" adminAs={admin ? user.pseudo : null} backHref="/booking">
      <p className="mb-4 text-right text-sm">
        <Link href="/booking/imports" className="text-white/60 underline">
          Mes imports précédents
        </Link>
      </p>
      <Importer />
    </Shell>
  );
}
