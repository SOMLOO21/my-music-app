import { notFound } from "next/navigation";
import Shell from "@/components/drop/Shell";
import { card } from "@/components/drop/styles";
import { DROP_CONFIG } from "@/drop/config/index";
import { todayInParis } from "@/drop/engine/dates";
import { MODE_LABELS, MODULE_LABELS, STATUS_LABELS, TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import { getRelease } from "@/drop/repo";
import { isAdminSession, pageUser } from "@/drop/session";

export const dynamic = "force-dynamic";

// Version provisoire (étape 4) : la feuille de route, le kanban et le calendrier arrivent aux étapes suivantes.
export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser(`/drop/${id}`);
  const view = await getRelease(user.id, id);
  if (!view) notFound();
  const today = todayInParis();
  const { release, tasks } = view;
  const done = tasks.filter((t) => t.status === "publie").length;

  return (
    <Shell title={release.title} backHref="/drop" adminAs={(await isAdminSession(user)) ? user.pseudo : null}>
      <div className={card}>
        <p className="text-xs text-white/50">
          {TYPE_LABELS[release.type]} · {release.artist_name} · {frShortDate(release.release_date)}
        </p>
        <p className="mt-1 text-2xl font-bold">
          {countdownLabel(release.release_date, today)} <span className="text-base font-semibold text-accent">· {MODE_LABELS[release.mode]}</span>
        </p>
        <p className="mt-1 text-sm text-white/60">
          {tasks.length} étapes · {tasks.length ? Math.round((done / tasks.length) * 100) : 0} % fait
        </p>
      </div>

      {release.warnings.length > 0 && (
        <ul className={`${card} mt-4 list-disc space-y-1 border-amber-300/40 pl-8 text-sm text-white/80`}>
          {release.warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}

      <ol className="mt-4 space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{t.title}</p>
              <span className="shrink-0 text-xs text-white/50">{frShortDate(t.due_date)}</span>
            </div>
            <p className="mt-1 text-xs text-white/50">
              {MODULE_LABELS[t.module]} · {STATUS_LABELS[t.status]}
              {t.alert && <span className="text-amber-300"> · {t.alert}</span>}
            </p>
            {t.ideas[0] && <p className="mt-2 text-sm text-white/70">💡 {t.ideas[0]}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-xs text-white/30">Configuration {DROP_CONFIG.version}</p>
    </Shell>
  );
}
