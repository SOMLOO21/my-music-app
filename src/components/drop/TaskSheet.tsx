"use client";
// Drop : fiche d'une tâche. Panneau latéral sur ordinateur, plein écran sur mobile.
// (Lecture seule pour l'instant : la modification arrive avec l'étape « Fiche tâche ».)
import { useEffect, useRef } from "react";
import { DROP_CONFIG } from "@/drop/config/index";
import { jLabel } from "@/drop/engine/dates";
import { PHASE_LABELS, dayLabel, frShortDate, isLate } from "@/drop/labels";
import type { Task } from "@/drop/types";
import { ModuleBadge, PlatformBadges, StatusBadge } from "./ui";

export default function TaskSheet({
  task,
  today,
  trackTitle,
  onClose,
}: {
  task: Task;
  today: string;
  trackTitle: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const formats = task.formats.map((id) => DROP_CONFIG.formats.find((f) => f.id === id)).filter((f) => f !== undefined);
  const late = isLate(task, today);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="task-sheet-title">
      <button type="button" className="absolute inset-0 hidden bg-black/60 md:block" aria-label="Fermer la fiche" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col overflow-y-auto bg-zinc-950 md:max-w-lg md:border-l md:border-white/10">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/50">{PHASE_LABELS[task.phase]}</span>
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-white/70 hover:text-white">
            Fermer ✕
          </button>
        </div>

        <div className="space-y-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
          <div>
            <h2 id="task-sheet-title" className="text-xl font-bold leading-snug">
              {task.title}
            </h2>
            <p className={`mt-1 text-sm ${late ? "text-red-300" : "text-white/60"}`}>
              {frShortDate(task.due_date)} · {dayLabel(task.due_date, today)}
              {task.offset_days !== null && ` · ${jLabel(task.offset_days)}`}
              {task.date_locked && " · date choisie à la main"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <ModuleBadge module={task.module} />
              <PlatformBadges platforms={task.platforms} />
              {trackTitle && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{trackTitle}</span>}
            </div>
          </div>

          {task.alert && <p className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">⚠️ {task.alert}</p>}

          {formats.length > 0 && (
            <Section title="Format attendu">
              <ul className="space-y-1 text-sm text-white/80">
                {formats.map((f) => (
                  <li key={f.id}>
                    <b>{f.label}</b> ({f.platformsLabel}) : {f.specs}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {task.why && (
            <Section title="Pourquoi c'est important">
              <p className="text-sm leading-relaxed text-white/80">{task.why}</p>
            </Section>
          )}

          {task.checklist.length > 0 && (
            <Section title="Comment le faire">
              <ul className="space-y-2">
                {task.checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs ${
                        c.done ? "border-accent bg-accent text-black" : "border-white/30"
                      }`}
                    >
                      {c.done ? "✓" : ""}
                    </span>
                    <span className={c.done ? "text-white/40 line-through" : ""}>{c.label}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {task.ideas.length > 0 && (
            <Section title="Idée de contenu">
              <ul className="space-y-2">
                {task.ideas.map((idea, i) => (
                  <li key={i} className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-white/90">
                    💡 {idea}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {task.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-white/80">{task.notes}</p>
            </Section>
          )}
          {task.link_url && (
            <Section title="Lien">
              <a href={task.link_url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-accent underline">
                {task.link_url}
              </a>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{title}</h3>
      {children}
    </section>
  );
}
