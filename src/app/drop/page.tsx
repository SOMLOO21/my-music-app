import Link from "next/link";
import Shell from "@/components/drop/Shell";
import { card, primary } from "@/components/drop/styles";
import { todayInParis } from "@/drop/engine/dates";
import { TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import { listReleases } from "@/drop/repo";
import { isAdminSession, pageUser } from "@/drop/session";
import type { ReleaseSummary } from "@/drop/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Drop · My Music App" };

/** Accueil de Drop : mes sorties, celles partagées avec moi, nouvelle sortie. */
export default async function DropHome() {
  const user = await pageUser("/drop");
  const today = todayInParis();
  const [{ mine, shared }, admin] = await Promise.all([listReleases(user.id, today), isAdminSession(user)]);

  return (
    <Shell title="Drop" adminAs={admin ? user.pseudo : null}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-lg">Salut {user.firstName} 🚀</p>
        <Link href="/drop/nouvelle" className={primary}>
          + Nouvelle sortie
        </Link>
      </div>

      {mine.length === 0 && shared.length === 0 ? (
        <div className={`${card} border-dashed p-6 text-center`}>
          <p className="text-4xl" aria-hidden>
            🗓️
          </p>
          <p className="mt-3 text-lg font-semibold">Ta prochaine sortie, étape par étape</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
            Choisis ta date de sortie, dis ce que tu as déjà : Drop te construit un planning complet, avec quoi faire chaque jour et une
            idée de contenu pour chaque étape.
          </p>
          <Link href="/drop/nouvelle" className={`${primary} mt-5 inline-block`}>
            Créer mon premier planning
          </Link>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold">Mes sorties</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-white/50">Aucune sortie pour l&apos;instant.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {mine.map((r) => (
                  <ReleaseCard key={r.id} r={r} today={today} />
                ))}
              </ul>
            )}
          </section>
          {shared.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold">Partagées avec moi</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {shared.map((r) => (
                  <ReleaseCard key={r.id} r={r} today={today} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function ReleaseCard({ r, today }: { r: ReleaseSummary; today: string }) {
  const progress = r.total ? Math.round((r.done / r.total) * 100) : 0;
  return (
    <li>
      <Link href={`/drop/${r.id}`} className={`${card} block h-full transition hover:border-white/30`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.title}</p>
            <p className="text-xs text-white/50">
              {TYPE_LABELS[r.type]} · {r.artist_name} · {frShortDate(r.release_date)}
              {r.role !== "owner" && ` · ${r.role === "editor" ? "éditeur" : "lecteur"}`}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-black">
            {countdownLabel(r.release_date, today)}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={`Progression : ${progress} %`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-white/60">
          {progress} % · {r.late > 0 ? <span className="text-red-300">{r.late} en retard · </span> : null}
          {r.next_task ? `Ensuite : ${r.next_task.title}` : "Tout est fait 🎉"}
        </p>
      </Link>
    </li>
  );
}
