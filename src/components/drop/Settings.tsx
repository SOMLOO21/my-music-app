"use client";
// Drop : paramètres d'une sortie (propriétaire). Toute modification passe par un aperçu du recalage
// (« 12 tâches déplacées, 2 ajoutées, 1 retirée ») avant d'être appliquée.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applySettings, deleteRelease, duplicateRelease, previewSettings, type SettingsBody, type SettingsPreview } from "@/drop/api";
import { DROP_CONFIG } from "@/drop/config/index";
import type { PlatformId } from "@/drop/config/schema";
import { diffDays, isIsoDate } from "@/drop/engine/dates";
import { MODE_LABELS, PLATFORM_LABELS, frShortDate } from "@/drop/labels";
import type { Release } from "@/drop/types";
import { card, choice, input, label, primary, secondary } from "./styles";

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function Settings({
  release,
  today,
  isOwner,
  onApplied,
  sharing,
}: {
  release: Release;
  today: string;
  isOwner: boolean;
  onApplied: (summary: string) => void;
  sharing?: React.ReactNode;
}) {
  const router = useRouter();
  const [releaseDate, setReleaseDate] = useState(release.release_date);
  const [platforms, setPlatforms] = useState<PlatformId[]>(release.platforms);
  const [assets, setAssets] = useState<string[]>(release.owned_assets);
  const [adminEnabled, setAdminEnabled] = useState(release.admin_enabled);
  const [includeLocked, setIncludeLocked] = useState(false);
  const [preview, setPreview] = useState<SettingsPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOwner) {
    return (
      <p className={`${card} text-sm text-white/60`}>
        Seule la personne qui a créé cette sortie peut changer sa date, ses plateformes ou son partage.
      </p>
    );
  }

  const changes: SettingsBody = {};
  if (releaseDate !== release.release_date) changes.releaseDate = releaseDate;
  if (!sameSet(platforms, release.platforms)) changes.platforms = platforms;
  if (!sameSet(assets, release.owned_assets)) {
    changes.ownedAssets = assets;
    changes.assetQuantities = Object.fromEntries(Object.entries(release.asset_quantities).filter(([k]) => assets.includes(k)));
  }
  if (adminEnabled !== release.admin_enabled) changes.adminEnabled = adminEnabled;
  const dirty = Object.keys(changes).length > 0;
  const valid = isIsoDate(releaseDate) && platforms.length > 0;

  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const loadPreview = (locked = includeLocked) => run(async () => setPreview(await previewSettings(release.id, { ...changes, includeLocked: locked })));
  const resetPreview = () => setPreview(null);

  const days = isIsoDate(releaseDate) ? diffDays(today, releaseDate) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className={`${card} space-y-5`} aria-labelledby="settings-plan">
        <h2 id="settings-plan" className="text-lg font-semibold">
          Date et contenu du planning
        </h2>

        <label className="block">
          <span className={label}>Date de sortie</span>
          <input
            type="date"
            className={input}
            value={releaseDate}
            onChange={(e) => {
              setReleaseDate(e.target.value);
              resetPreview();
            }}
          />
          {days !== null && releaseDate !== release.release_date && (
            <span className="mt-1 block text-xs text-white/50">
              {days >= 0 ? `Dans ${days} jour${days > 1 ? "s" : ""}` : "Date passée"} (au lieu du {frShortDate(release.release_date)}).
              {(release.type === "ep" || release.type === "album") && " Les dates des singles et des clips suivent le même décalage."}
            </span>
          )}
        </label>

        <fieldset>
          <legend className={label}>Plateformes</legend>
          <div className="flex flex-wrap gap-2">
            {DROP_CONFIG.platforms.map((p) => {
              const on = platforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPlatforms(on ? platforms.filter((x) => x !== p.id) : [...platforms, p.id]);
                    resetPreview();
                  }}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${on ? "border-accent bg-accent/15 text-accent" : "border-white/20 text-white/70"}`}
                >
                  {on ? "✓ " : ""}
                  {PLATFORM_LABELS[p.id]}
                </button>
              );
            })}
          </div>
          {platforms.length === 0 && <p className="mt-1 text-xs text-amber-300">Garde au moins une plateforme.</p>}
        </fieldset>

        <fieldset>
          <legend className={label}>Contenus déjà disponibles</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DROP_CONFIG.assets.map((a) => {
              const on = assets.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setAssets(on ? assets.filter((x) => x !== a.id) : [...assets, a.id]);
                    resetPreview();
                  }}
                  className={`${choice(on)} min-h-11 p-3 text-sm`}
                >
                  {on ? "✓ " : ""}
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-white/50">Les statuts déjà en place ne changent pas : seules les nouvelles tâches en tiennent compte.</p>
        </fieldset>

        <button
          type="button"
          role="switch"
          aria-checked={adminEnabled}
          onClick={() => {
            setAdminEnabled(!adminEnabled);
            resetPreview();
          }}
          className={`${choice(adminEnabled)} flex items-center justify-between gap-4`}
        >
          <span>
            <span className="block font-semibold">Module administratif {adminEnabled ? "activé" : "désactivé"}</span>
            <span className="mt-1 block text-sm text-white/60">Distribution, ISRC, SACEM, pitch Spotify.</span>
          </span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full ${adminEnabled ? "bg-accent" : "bg-white/20"}`} aria-hidden>
            <span className={`absolute top-1 size-5 rounded-full bg-black transition-all ${adminEnabled ? "left-6" : "left-1"}`} />
          </span>
        </button>

        {!preview && (
          <button type="button" disabled={!dirty || !valid || busy} className={primary} onClick={() => loadPreview()}>
            {busy ? "Calcul…" : "Voir l'aperçu des changements"}
          </button>
        )}

        {preview && (
          <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4" aria-live="polite">
            <p className="text-base font-semibold">{preview.summary}</p>
            <p className="text-sm text-white/70">
              Mode après changement : <b className="text-accent">{MODE_LABELS[preview.mode as keyof typeof MODE_LABELS] ?? preview.mode}</b>. Statuts, notes
              et liens sont conservés.
            </p>
            {(preview.lockedSkipped > 0 || includeLocked) && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={includeLocked}
                  className="size-5 accent-[var(--accent)]"
                  onChange={(e) => {
                    setIncludeLocked(e.target.checked);
                    loadPreview(e.target.checked);
                  }}
                />
                Recaler également les tâches que j&apos;ai déplacées
                {!includeLocked && ` (${preview.lockedSkipped})`}
              </label>
            )}
            <ChangeList title="Déplacées" items={preview.moves.map((m) => `${m.title} : ${frShortDate(m.from)} → ${frShortDate(m.to)}`)} />
            <ChangeList title="Ajoutées" items={preview.additions.map((a) => `${a.title} (${frShortDate(a.dueDate)})`)} />
            <ChangeList title="Retirées" items={preview.removals.map((r) => r.title)} />
            {preview.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200/90">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                className={primary}
                onClick={async () => {
                  const res = await run(() => applySettings(release.id, { ...changes, includeLocked }));
                  if (res) onApplied(res.summary);
                }}
              >
                {busy ? "Application…" : "Appliquer"}
              </button>
              <button type="button" className={secondary} onClick={resetPreview}>
                Modifier encore
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>

      {sharing}

      <section className={`${card} space-y-3`} aria-labelledby="settings-release">
        <h2 id="settings-release" className="text-lg font-semibold">
          La sortie
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondary}
            disabled={busy}
            onClick={async () => {
              const copy = await run(() => duplicateRelease(release.id));
              if (copy) router.push(`/drop/${copy.id}`);
            }}
          >
            Dupliquer la sortie
          </button>
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmer la suppression de la sortie">
              <span className="text-sm text-white/70">Supprimer « {release.title} » et tout son planning ?</span>
              <button
                type="button"
                className="min-h-11 rounded-full bg-red-500 px-4 text-sm font-semibold text-white"
                onClick={async () => {
                  const ok = await run(() => deleteRelease(release.id));
                  if (ok) router.push("/drop");
                }}
              >
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
              Supprimer la sortie
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ChangeList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-white/80">
        {title} ({items.length})
      </summary>
      <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-white/60">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </details>
  );
}
