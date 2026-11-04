"use client";
// Drop : ajout d'une tâche personnalisée (titre, date, module, plateformes, notes).
import { useEffect, useRef, useState } from "react";
import type { NewTaskBody } from "@/drop/api";
import { DROP_CONFIG } from "@/drop/config/index";
import type { ModuleId, PlatformId } from "@/drop/config/schema";
import { isIsoDate } from "@/drop/engine/dates";
import { MODULE_LABELS, PLATFORM_LABELS } from "@/drop/labels";
import type { Track } from "@/drop/types";
import { input, label, primary, secondary } from "./styles";

export default function NewTaskForm({
  today,
  platforms,
  tracks,
  onCancel,
  onCreate,
}: {
  today: string;
  platforms: PlatformId[];
  tracks: Track[];
  onCancel: () => void;
  onCreate: (body: NewTaskBody) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [module, setModule] = useState<ModuleId>("reseaux");
  const [chosen, setChosen] = useState<PlatformId[]>([]);
  const [trackId, setTrackId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const valid = title.trim().length > 0 && isIsoDate(dueDate);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), dueDate, module, platforms: chosen, notes: notes.trim() || null, trackId: trackId || null });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Annuler" onClick={onCancel} />
      <form
        onSubmit={submit}
        className="relative max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl"
      >
        <h2 id="new-task-title" className="mb-4 text-lg font-bold">
          Ajouter une tâche
        </h2>
        <div className="space-y-4">
          <label className="block">
            <span className={label}>Titre</span>
            <input ref={first} className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="block">
            <span className={label}>Date</span>
            <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Module</span>
            <select className={input} value={module} onChange={(e) => setModule(e.target.value as ModuleId)}>
              {DROP_CONFIG.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {MODULE_LABELS[m.id]}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className={label}>Plateformes (facultatif)</legend>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => {
                const on = chosen.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(on ? chosen.filter((x) => x !== p) : [...chosen, p])}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${on ? "border-accent bg-accent/15 text-accent" : "border-white/20 text-white/70"}`}
                  >
                    {on ? "✓ " : ""}
                    {PLATFORM_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {tracks.length > 0 && (
            <label className="block">
              <span className={label}>Titre concerné (facultatif)</span>
              <select className={input} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                <option value="">Tout le projet</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.position}. {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={label}>Notes (facultatif)</span>
            <textarea rows={3} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" className={secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" disabled={!valid || saving} className={`${primary} flex-1`}>
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
    </div>
  );
}
