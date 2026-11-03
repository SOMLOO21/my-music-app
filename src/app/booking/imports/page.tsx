import Link from "next/link";
import Shell from "@/components/booking/Shell";
import { card, primary } from "@/components/booking/styles";
import { listImports } from "@/booking/repo";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

/** Historique des imports de l'artiste. */
export default async function ImportsPage() {
  const user = await pageUser("/booking/imports");
  const [imports, admin] = await Promise.all([listImports(user.id), isAdminSession(user)]);
  return (
    <Shell title="Mes imports" tab="import" adminAs={admin ? user.pseudo : null} backHref="/booking/import">
      {imports.length === 0 ? (
        <div className={`${card} space-y-3 text-sm text-white/60`}>
          <p>Tu n&apos;as encore rien importé. Importe ton fichier de suivi pour retrouver tes lieux et tes démarches.</p>
          <Link href="/booking/import" className={`${primary} inline-block`}>
            Importer mon fichier
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {imports.map((i) => (
            <li key={i.id} className={card}>
              <p className="break-all font-medium">
                {i.filename}
                {i.sheet && <span className="text-white/50"> · {i.sheet}</span>}
              </p>
              <p className="text-xs text-white/50">
                {new Date(i.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
              </p>
              <p className="mt-2 text-sm text-white/70">
                {i.rows_total} ligne(s) · {i.rows_imported} contact(s) importé(s) · {i.rows_duplicates} doublon(s) ·{" "}
                {i.venues_matched} lieu(x) reconnu(s) · {i.venues_created} lieu(x) privé(s) créé(s) · {i.outreach_created} démarche(s)
                {i.rows_invalid ? ` · ${i.rows_invalid} ligne(s) invalide(s)` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
