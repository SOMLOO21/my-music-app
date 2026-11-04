"use client";
// Drop : feuille de route. Répond à « je ne sais pas comment sortir mon single » :
// ce qu'il faut faire aujourd'hui, cette semaine, puis la frise des 4 phases.
import { DROP_CONFIG, phaseFor } from "@/drop/config/index";
import { addDays, diffDays } from "@/drop/engine/dates";
import type { PlanWarning } from "@/drop/engine/types";
import { frShortDate, isLate } from "@/drop/labels";
import type { Task } from "@/drop/types";
import { card } from "./styles";
import { TaskRow } from "./ui";

export default function Roadmap({
  tasks,
  today,
  releaseDate,
  warnings,
  trackTitles,
  onOpen,
}: {
  tasks: Task[];
  today: string;
  releaseDate: string;
  warnings: PlanWarning[];
  trackTitles: Record<string, string>;
  onOpen: (task: Task) => void;
}) {
  const open = tasks.filter((t) => t.status !== "publie");
  const late = open.filter((t) => isLate(t, today));
  const dueToday = open.filter((t) => t.due_date === today && !isLate(t, today));
  const weekEnd = addDays(today, 7);
  const thisWeek = open.filter((t) => t.due_date > today && t.due_date <= weekEnd);
  const next = open.find((t) => t.due_date > today);
  const currentPhase = phaseFor(DROP_CONFIG, diffDays(releaseDate, today));
  const row = (t: Task, showDate = true) => (
    <TaskRow key={t.id} task={t} today={today} trackTitle={t.track_id ? trackTitles[t.track_id] : null} onOpen={onOpen} showDate={showDate} />
  );

  return (
    <div className="space-y-5">
      {/* Aujourd'hui */}
      <section className={`${card} border-accent/40 p-2 sm:p-3`} aria-labelledby="today-title">
        <h2 id="today-title" className="px-3 pt-2 text-lg font-bold">
          Aujourd&apos;hui
        </h2>
        {dueToday.length === 0 && late.length === 0 ? (
          <p className="px-3 pb-3 pt-1 text-sm text-white/60">
            Rien de prévu aujourd&apos;hui.
            {next && (
              <>
                {" "}
                Prochaine étape le {frShortDate(next.due_date)} :{" "}
                <button type="button" className="font-semibold text-accent underline" onClick={() => onOpen(next)}>
                  {next.title}
                </button>
              </>
            )}
          </p>
        ) : (
          <div className="mt-1">
            {dueToday.map((t) => row(t, false))}
            {late.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-3 text-xs font-semibold text-red-200/80">
                  {late.length === 1 ? "1 étape à rattraper" : `${late.length} étapes à rattraper`}, à ton rythme :
                </p>
                {late.map((t) => row(t))}
              </>
            )}
          </div>
        )}
      </section>

      {/* Cette semaine */}
      <section aria-labelledby="week-title">
        <h2 id="week-title" className="mb-2 text-base font-semibold">
          Cette semaine
        </h2>
        {thisWeek.length === 0 ? (
          <p className="text-sm text-white/50">Rien d&apos;autre dans les 7 prochains jours.</p>
        ) : (
          <div className={`${card} p-1`}>{thisWeek.map((t) => row(t))}</div>
        )}
      </section>

      {/* Alertes du moteur */}
      {warnings.length > 0 && (
        <details className={`${card} border-amber-300/30`}>
          <summary className="cursor-pointer text-sm font-semibold text-amber-200">
            À savoir sur ton planning ({warnings.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/75">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Frise des 4 phases */}
      <section aria-labelledby="phases-title">
        <h2 id="phases-title" className="mb-3 text-base font-semibold">
          Les 4 phases
        </h2>
        <ol className="relative space-y-3 border-l border-white/15 pl-5">
          {DROP_CONFIG.phases.map((phase) => {
            const items = tasks.filter((t) => t.phase === phase.id);
            const done = items.filter((t) => t.status === "publie").length;
            const pct = items.length ? Math.round((done / items.length) * 100) : 0;
            const dates = items.map((t) => t.due_date).sort();
            const current = phase.id === currentPhase;
            return (
              <li key={phase.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-[27px] top-5 size-3 rounded-full border-2 ${
                    current ? "border-accent bg-accent" : pct === 100 && items.length ? "border-accent bg-background" : "border-white/30 bg-background"
                  }`}
                />
                <details open={current} className={`${card} ${current ? "border-accent/60" : ""}`}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {phase.label}
                          {current && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-black">En cours</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-white/50">
                          {dates.length
                            ? dates[0] === dates.at(-1)
                              ? frShortDate(dates[0])
                              : `${frShortDate(dates[0])} → ${frShortDate(dates.at(-1)!)}`
                            : "Aucune étape"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-white/70">
                        {done}/{items.length}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-white/60">{phase.message}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={`${phase.label} : ${pct} %`}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </summary>
                  {items.length > 0 && <div className="-mx-2 mt-3 border-t border-white/10 pt-2">{items.map((t) => row(t))}</div>}
                </details>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
