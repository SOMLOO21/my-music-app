"use client";
// Drop : fiche d'une tâche. Panneau latéral sur ordinateur, plein écran sur mobile.
// Propriétaire et éditeur modifient (titre, statut, date, sous-étapes, notes, lien) ; seul le propriétaire supprime.
import { useEffect, useRef, useState } from "react";
import type { TaskPatchBody } from "@/drop/api";
import { DROP_CONFIG } from "@/drop/config/index";
import { STATUS_IDS } from "@/drop/config/schema";
import { jLabel } from "@/drop/engine/dates";
import { PHASE_LABELS, STATUS_LABELS, dayLabel, frShortDate, isLate } from "@/drop/labels";
import type { Task } from "@/drop/types";
import { input, label, secondary } from "./styles";
import { ModuleBadge, PlatformBadges, StatusBadge } from "./ui";

const isUrl = (v: string) => v === "" || /^https?:\/\/\S+$/i.test(v);

export default function TaskSheet({
  task,
  today,
  trackTitle,
  canEdit,
  isOwner,
  onClose,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  task: Task;
  today: string;
  trackTitle: string | null;
  canEdit: boolean;
  isOwner: boolean;
  onClose: () => void;
  onPatch: (task: Task, patch: TaskPatchBody) => void;
  onDuplicate: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [link, setLink] = useState(task.link_url ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const formats = task.formats.map((id) => DROP_CONFIG.formats.find((f) => f.id === id)).filter((f) => f !== undefined);
  const late = isLate(task, today);
  const patch = (p: TaskPatchBody) => onPatch(task, p);
  const linkValid = isUrl(link.trim());

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
            {canEdit ? (
              <>
                <label htmlFor="task-title" className="sr-only">
                  Titre de la tâche
                </label>
                <textarea
                  id="task-title"
                  rows={2}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() && title.trim() !== task.title && patch({ title: title.trim() })}
                  className="w-full resize-none rounded-lg bg-transparent text-xl font-bold leading-snug outline-none focus:bg-white/5"
                />
                <h2 id="task-sheet-title" className="sr-only">
                  {task.title}
                </h2>
              </>
            ) : (
              <h2 id="task-sheet-title" className="text-xl font-bold leading-snug">
                {task.title}
              </h2>
            )}
            <p className={`mt-1 text-sm ${late ? "text-red-300" : "text-white/60"}`}>
              {frShortDate(task.due_date)} · {dayLabel(task.due_date, today)}
              {task.offset_days !== null && ` · ${jLabel(task.offset_days)}`}
              {task.date_locked && " · date choisie à la main"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!canEdit && <StatusBadge status={task.status} />}
              <ModuleBadge module={task.module} />
              <PlatformBadges platforms={task.platforms} />
              {trackTitle && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{trackTitle}</span>}
            </div>
          </div>

          {canEdit && (
            <div className="space-y-4">
              <fieldset>
                <legend className={label}>Statut</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STATUS_IDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={task.status === s}
                      onClick={() => task.status !== s && patch({ status: s })}
                      className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${
                        task.status === s ? "border-accent bg-accent text-black" : "border-white/15 text-white/70 hover:border-white/40"
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className={label}>Date</span>
                <input
                  type="date"
                  className={input}
                  value={task.due_date}
                  onChange={(e) => e.target.value && patch({ dueDate: e.target.value })}
                />
                <span className="mt-1 block text-xs text-white/50">
                  Une date choisie à la main ne bouge plus si la date de sortie change (sauf si tu le demandes).
                </span>
              </label>
            </div>
          )}

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
              <ul className="space-y-1">
                {task.checklist.map((c, i) => (
                  <li key={i}>
                    <label className={`flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 text-sm ${canEdit ? "cursor-pointer hover:bg-white/5" : ""}`}>
                      <input
                        type="checkbox"
                        checked={c.done}
                        disabled={!canEdit}
                        onChange={() => patch({ checklist: task.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}
                        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className={c.done ? "text-white/50 line-through" : "text-white/80"}>{c.label}</span>
                    </label>
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

          {canEdit ? (
            <>
              <label className="block">
                <span className={label}>Notes</span>
                <textarea
                  rows={4}
                  className={input}
                  value={notes}
                  placeholder="Ce que tu veux retenir pour cette étape…"
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== (task.notes ?? "") && patch({ notes: notes.trim() ? notes : null })}
                />
              </label>
              <label className="block">
                <span className={label}>Lien (Google Drive, Dropbox…)</span>
                <input
                  type="url"
                  inputMode="url"
                  className={`${input} ${linkValid ? "" : "border-red-400"}`}
                  value={link}
                  placeholder="https://"
                  onChange={(e) => setLink(e.target.value)}
                  onBlur={() => linkValid && link.trim() !== (task.link_url ?? "") && patch({ linkUrl: link.trim() })}
                  aria-invalid={!linkValid}
                />
                {!linkValid && <span className="mt-1 block text-xs text-red-300">Le lien doit commencer par http:// ou https://</span>}
                {task.link_url && (
                  <a href={task.link_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-accent underline">
                    Ouvrir le lien ↗
                  </a>
                )}
              </label>
            </>
          ) : (
            <>
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
            </>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button type="button" className={secondary} onClick={() => onDuplicate(task)}>
                Dupliquer
              </button>
              {isOwner &&
                (confirmDelete ? (
                  <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmer la suppression">
                    <span className="text-sm text-white/70">Supprimer cette tâche ?</span>
                    <button type="button" className="min-h-11 rounded-full bg-red-500 px-4 text-sm font-semibold text-white" onClick={() => onDelete(task)}>
                      Oui, supprimer
                    </button>
                    <button type="button" className={secondary} onClick={() => setConfirmDelete(false)}>
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="min-h-11 rounded-full border border-red-400/40 px-4 text-sm text-red-200 hover:border-red-300"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Supprimer
                  </button>
                ))}
            </div>
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
