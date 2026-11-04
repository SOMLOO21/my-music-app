"use client";
// Drop : assistant de création d'une sortie, en 6 étapes, une question à la fois.
// Les réponses sont gardées dans le navigateur (sessionStorage) jusqu'à la génération.
// Le récapitulatif fait tourner le moteur localement : ce que l'artiste voit est ce qui sera généré.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DROP_CONFIG } from "@/drop/config/index";
import type { PlatformId, ReleaseType } from "@/drop/config/schema";
import { diffDays, isIsoDate, todayInParis } from "@/drop/engine/dates";
import { generatePlan, proposeSingleDates } from "@/drop/engine/generate";
import type { PlanInput } from "@/drop/engine/types";
import { card, choice, input, label, primary, secondary } from "./styles";

interface TrackDraft {
  title: string;
  isSingle: boolean;
  /** Date choisie par l'artiste (sinon : date proposée). */
  singleDate: string | null;
  hasClip: boolean;
  clipDate: string | null;
}

interface Draft {
  type: ReleaseType | null;
  artistName: string;
  title: string;
  releaseDate: string;
  clipIsRelaunch: boolean | null;
  tracks: TrackDraft[];
  platforms: PlatformId[];
  ownedAssets: string[];
  quantities: Record<string, number>;
  adminEnabled: boolean;
}

const STORAGE_KEY = "drop-wizard-draft";
const STEPS = ["Type", "Infos", "Plateformes", "Contenus", "Admin", "Récap"] as const;
const { minTracks, maxTracks } = DROP_CONFIG.settings.ep;
const emptyTrack = (): TrackDraft => ({ title: "", isSingle: false, singleDate: null, hasClip: false, clipDate: null });

const TYPES = [
  { type: "single", emoji: "🎵", label: "Single", text: "Un titre seul : Drop prépare l'annonce, les teasers, le jour J et la suite." },
  { type: "clip", emoji: "🎬", label: "Clip", text: "Un clip, qui sort avec son single ou qui relance un son déjà sorti." },
  { type: "ep", emoji: "💿", label: "EP / Album", text: "Plusieurs titres, avec des singles extraits et des clips, en cascade." },
] as const;

const isProject = (t: ReleaseType | null) => t === "ep" || t === "album";
const frDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function countdown(days: number) {
  if (days > 1) return `Ta sortie est dans ${days} jours`;
  if (days === 1) return "Ta sortie est demain";
  if (days === 0) return "Ta sortie est aujourd'hui";
  return `Ta sortie date d'il y a ${-days} jour${days < -1 ? "s" : ""}`;
}

export default function Wizard({ defaultArtist }: { defaultArtist: string }) {
  const router = useRouter();
  const today = useMemo(() => todayInParis(), []);
  // Reprise d'un brouillon en cours (retour arrière du navigateur, rechargement).
  // Le composant n'est rendu que dans le navigateur (WizardLoader), on peut lire sessionStorage tout de suite.
  const [saved] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { step: number; draft: Draft }) : null;
    } catch {
      return null;
    }
  });
  const [step, setStep] = useState(() => (saved ? Math.min(Math.max(saved.step, 0), STEPS.length - 1) : 0));
  const [draft, setDraft] = useState<Draft>(
    () =>
      saved?.draft ?? {
        type: null,
        artistName: defaultArtist,
        title: "",
        releaseDate: "",
        clipIsRelaunch: null,
        tracks: [emptyTrack(), emptyTrack(), emptyTrack(), emptyTrack()],
        platforms: ["tiktok", "instagram", "youtube"],
        ownedAssets: [],
        quantities: {},
        adminEnabled: true,
      },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, draft }));
    } catch {
      // stockage indisponible : rien à faire
    }
  }, [step, draft]);
  useEffect(() => heading.current?.focus(), [step]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setTrack = (i: number, patch: Partial<TrackDraft>) =>
    setDraft((d) => ({ ...d, tracks: d.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const setTrackCount = (n: number) =>
    setDraft((d) => ({ ...d, tracks: Array.from({ length: n }, (_, i) => d.tracks[i] ?? emptyTrack()) }));

  // Dates proposées des singles extraits, dans l'ordre des titres.
  const singleIdx = draft.tracks.map((t, i) => (t.isSingle ? i : -1)).filter((i) => i >= 0);
  const proposed = isIsoDate(draft.releaseDate) ? proposeSingleDates(DROP_CONFIG, draft.releaseDate, singleIdx.length) : [];
  const singleDateOf = (i: number) => draft.tracks[i].singleDate ?? proposed[singleIdx.indexOf(i)] ?? null;

  const payload = () => ({
    type: draft.type,
    title: draft.title.trim(),
    artistName: draft.artistName.trim(),
    releaseDate: draft.releaseDate,
    clipIsRelaunch: draft.type === "clip" ? Boolean(draft.clipIsRelaunch) : false,
    platforms: draft.platforms,
    ownedAssets: draft.ownedAssets,
    assetQuantities: Object.fromEntries(Object.entries(draft.quantities).filter(([k, v]) => draft.ownedAssets.includes(k) && v > 0)),
    adminEnabled: draft.adminEnabled,
    tracks: isProject(draft.type)
      ? draft.tracks.map((t, i) => ({
          title: t.title.trim(),
          isSingle: t.isSingle,
          singleReleaseDate: t.isSingle ? singleDateOf(i) : null,
          hasClip: t.hasClip,
          clipReleaseDate: t.hasClip ? t.clipDate : null,
        }))
      : [],
  });

  const plan = useMemo(() => {
    if (step !== STEPS.length - 1 || !draft.type || !isIsoDate(draft.releaseDate)) return null;
    const p = payload();
    const planInput: PlanInput = {
      type: draft.type,
      releaseDate: p.releaseDate,
      platforms: p.platforms,
      ownedAssets: p.ownedAssets,
      adminEnabled: p.adminEnabled,
      clipIsRelaunch: p.clipIsRelaunch,
      tracks: p.tracks.map((t, i) => ({ ...t, key: `t${i}` })),
    };
    return generatePlan(planInput, DROP_CONFIG, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft, today]);

  const days = isIsoDate(draft.releaseDate) ? diffDays(today, draft.releaseDate) : null;
  const canContinue = [
    draft.type !== null,
    Boolean(draft.artistName.trim() && draft.title.trim() && isIsoDate(draft.releaseDate)) &&
      (draft.type !== "clip" || draft.clipIsRelaunch !== null) &&
      (!isProject(draft.type) || draft.tracks.every((t) => t.title.trim())),
    draft.platforms.length > 0,
    true,
    true,
    true,
  ][step];

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/drop/releases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.status === 401) throw new Error("Ta session a expiré : reconnecte-toi, tes réponses sont gardées.");
      if (!res.ok || !data.id) throw new Error(data.error ?? "Le planning n'a pas pu être créé, réessaie dans un instant.");
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // rien à faire
      }
      router.push(`/drop/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : submit());
  const back = () => (step > 0 ? setStep(step - 1) : router.push("/drop"));

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 py-2">
        <button type="button" onClick={back} className="min-h-11 rounded-full px-3 text-white/70 hover:text-white" aria-label="Retour">
          ← Retour
        </button>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-white/50">
            Étape {step + 1} sur {STEPS.length} · {STEPS[step]}
          </p>
        </div>
      </div>

      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue && !saving) next();
        }}
      >
        <div className="flex-1 pb-6 pt-4">
          {step === 0 && (
            <Step title="Qu'est-ce que tu sors ?" heading={heading}>
              <div className="space-y-3">
                {TYPES.map((t) => {
                  const selected = t.type === "ep" ? isProject(draft.type) : draft.type === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        set({ type: t.type === "ep" && isProject(draft.type) ? draft.type : t.type });
                        setStep(1);
                      }}
                      className={`${choice(selected)} flex items-start gap-4`}
                    >
                      <span className="text-3xl" aria-hidden>
                        {t.emoji}
                      </span>
                      <span>
                        <span className="block text-lg font-semibold">{t.label}</span>
                        <span className="mt-1 block text-sm text-white/60">{t.text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step title="Parle-nous de ta sortie" heading={heading}>
              <div className="space-y-4">
                {isProject(draft.type) && (
                  <div className="flex gap-2" role="radiogroup" aria-label="Format du projet">
                    {(["ep", "album"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={draft.type === t}
                        onClick={() => set({ type: t })}
                        className={`min-h-11 flex-1 rounded-full border text-sm font-semibold ${
                          draft.type === t ? "border-accent bg-accent text-black" : "border-white/20 text-white/70"
                        }`}
                      >
                        {t === "ep" ? "EP" : "Album"}
                      </button>
                    ))}
                  </div>
                )}
                <Field label="Nom d'artiste">
                  <input className={input} value={draft.artistName} onChange={(e) => set({ artistName: e.target.value })} autoComplete="off" />
                </Field>
                <Field label={isProject(draft.type) ? "Titre du projet" : draft.type === "clip" ? "Titre du son" : "Titre du single"}>
                  <input className={input} value={draft.title} onChange={(e) => set({ title: e.target.value })} autoComplete="off" />
                </Field>

                {draft.type === "clip" && (
                  <fieldset>
                    <legend className={label}>Le son est-il déjà sorti ?</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: true, t: "Oui", d: "C'est un clip de relance" },
                        { v: false, t: "Non", d: "Le son et le clip sortent ensemble" },
                      ].map((o) => (
                        <button
                          key={o.t}
                          type="button"
                          aria-pressed={draft.clipIsRelaunch === o.v}
                          onClick={() => set({ clipIsRelaunch: o.v })}
                          className={choice(draft.clipIsRelaunch === o.v)}
                        >
                          <span className="block font-semibold">{o.t}</span>
                          <span className="block text-xs text-white/60">{o.d}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <Field label={draft.type === "clip" && draft.clipIsRelaunch ? "Date de sortie du clip" : "Date de sortie"}>
                  <input type="date" className={input} value={draft.releaseDate} onChange={(e) => set({ releaseDate: e.target.value })} />
                </Field>
                {days !== null && (
                  <p className={`text-sm ${days < 0 ? "text-amber-300" : "text-white/60"}`}>
                    {days < 0
                      ? "Cette date est passée : Drop ne prévoira que les étapes d'après-sortie encore à venir."
                      : `${countdown(days)}, le ${frDate(draft.releaseDate)}.`}
                  </p>
                )}

                {isProject(draft.type) && (
                  <div className="space-y-3 pt-2">
                    <Field label="Nombre de titres">
                      <select className={input} value={draft.tracks.length} onChange={(e) => setTrackCount(Number(e.target.value))}>
                        {Array.from({ length: maxTracks - minTracks + 1 }, (_, i) => i + minTracks).map((n) => (
                          <option key={n} value={n}>
                            {n} titres
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-sm text-white/60">
                      Coche les singles extraits : Drop propose une date pour chacun (le dernier 3 semaines avant le projet, puis tous les
                      28 jours avant). Tu peux la changer.
                    </p>
                    <ol className="space-y-3">
                      {draft.tracks.map((t, i) => (
                        <li key={i} className={card}>
                          <label className="sr-only" htmlFor={`track-${i}`}>
                            Titre {i + 1}
                          </label>
                          <input
                            id={`track-${i}`}
                            className={input}
                            placeholder={`Titre ${i + 1}`}
                            value={t.title}
                            onChange={(e) => setTrack(i, { title: e.target.value })}
                            autoComplete="off"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Toggle checked={t.isSingle} onChange={(v) => setTrack(i, { isSingle: v, singleDate: null })}>
                              Single extrait
                            </Toggle>
                            <Toggle checked={t.hasClip} onChange={(v) => setTrack(i, { hasClip: v, clipDate: null })}>
                              Clip
                            </Toggle>
                          </div>
                          {t.isSingle && (
                            <Field label="Date du single" className="mt-3">
                              <input
                                type="date"
                                className={input}
                                value={singleDateOf(i) ?? ""}
                                onChange={(e) => setTrack(i, { singleDate: e.target.value || null })}
                              />
                            </Field>
                          )}
                          {t.hasClip && (
                            <Field label="Date du clip (facultatif)" className="mt-3">
                              <input
                                type="date"
                                className={input}
                                value={t.clipDate ?? ""}
                                onChange={(e) => setTrack(i, { clipDate: e.target.value || null })}
                              />
                              <span className="mt-1 block text-xs text-white/50">
                                Vide : le clip sort le même jour que {t.isSingle ? "le single" : "le projet"}.
                              </span>
                            </Field>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </Step>
          )}

          {step === 2 && (
            <Step title="Sur quels réseaux tu publies ?" heading={heading} hint="Drop ne prévoit des contenus que pour les réseaux cochés.">
              <div className="space-y-3">
                {DROP_CONFIG.platforms.map((p) => {
                  const on = draft.platforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({ platforms: on ? draft.platforms.filter((x) => x !== p.id) : [...draft.platforms, p.id] })
                      }
                      className={`${choice(on)} flex items-center justify-between`}
                    >
                      <span className="text-lg font-semibold">{p.label}</span>
                      <Check on={on} />
                    </button>
                  );
                })}
                {draft.platforms.length === 0 && <p className="text-sm text-amber-300">Coche au moins un réseau.</p>}
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step
              title="Qu'est-ce que tu as déjà ?"
              heading={heading}
              hint="Coche ce qui est prêt : les étapes correspondantes démarreront en « Prêt ». Rien de prêt ? Pas de souci, Drop te dit quoi produire."
            >
              <ul className="space-y-2">
                {DROP_CONFIG.assets.map((a) => {
                  const on = draft.ownedAssets.includes(a.id);
                  return (
                    <li key={a.id} className={`${choice(on)} flex items-center gap-3 p-0`}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set({ ownedAssets: on ? draft.ownedAssets.filter((x) => x !== a.id) : [...draft.ownedAssets, a.id] })
                        }
                        className="flex min-h-12 flex-1 items-center gap-3 p-3 text-left"
                      >
                        <Check on={on} />
                        <span>{a.label}</span>
                      </button>
                      {on && (
                        <label className="mr-3 flex items-center gap-1 text-xs text-white/50">
                          <span className="sr-only">Quantité pour {a.label}</span>
                          Qté
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={999}
                            className="w-16 rounded-lg border border-white/20 bg-black/40 px-2 py-2 text-base text-white"
                            value={draft.quantities[a.id] ?? ""}
                            onChange={(e) =>
                              set({ quantities: { ...draft.quantities, [a.id]: Math.min(999, Math.max(0, Number(e.target.value) || 0)) } })
                            }
                          />
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Step>
          )}

          {step === 4 && (
            <Step title="Module administratif" heading={heading}>
              <button
                type="button"
                role="switch"
                aria-checked={draft.adminEnabled}
                onClick={() => set({ adminEnabled: !draft.adminEnabled })}
                className={`${choice(draft.adminEnabled)} flex items-center justify-between gap-4`}
              >
                <span>
                  <span className="block font-semibold">{draft.adminEnabled ? "Activé" : "Désactivé"}</span>
                  <span className="mt-1 block text-sm text-white/60">
                    Distribution, ISRC, SACEM, pitch Spotify. Désactive si c&apos;est déjà géré par ton label ou ton distributeur.
                  </span>
                </span>
                <span
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${draft.adminEnabled ? "bg-accent" : "bg-white/20"}`}
                  aria-hidden
                >
                  <span className={`absolute top-1 size-5 rounded-full bg-black transition-all ${draft.adminEnabled ? "left-6" : "left-1"}`} />
                </span>
              </button>
            </Step>
          )}

          {step === 5 && plan && days !== null && (
            <Step title="Ton planning est prêt à être généré" heading={heading}>
              {(() => {
                const mode = DROP_CONFIG.settings.modes.find((m) => m.id === plan.mode)!;
                return (
                  <div className="space-y-3">
                    <div className={card}>
                      <p className="text-2xl font-bold">{countdown(days)}</p>
                      <p className="mt-1 text-sm text-white/60">
                        {draft.title} · {draft.artistName} · {frDate(draft.releaseDate)}
                      </p>
                    </div>
                    <div className={card}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Mode</p>
                      <p className="mt-1 text-lg font-semibold text-accent">{mode.label}</p>
                      <p className="mt-1 text-sm text-white/70">{mode.explanation}</p>
                    </div>
                    <div className={card}>
                      <p className="text-lg font-semibold">{plan.tasks.length} étapes au programme</p>
                      <p className="mt-1 text-sm text-white/60">
                        {plan.tasks.filter((t) => t.status === "pret").length} déjà prêtes grâce à tes contenus, chacune avec une idée concrète.
                      </p>
                    </div>
                    {plan.warnings.length > 0 && (
                      <div className={`${card} border-amber-300/40`}>
                        <p className="font-semibold text-amber-300">À savoir</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/80">
                          {plan.warnings.map((w, i) => (
                            <li key={i}>{w.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {error && (
                      <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })()}
            </Step>
          )}
        </div>

        {step > 0 && (
          <div className="sticky bottom-0 -mx-4 border-t border-white/10 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="flex gap-3">
              <button type="button" onClick={back} className={secondary}>
                Retour
              </button>
              <button type="submit" disabled={!canContinue || saving} className={`${primary} flex-1`}>
                {step === STEPS.length - 1 ? (saving ? "Génération…" : "Générer mon planning") : "Continuer"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Step({
  title,
  hint,
  heading,
  children,
}: {
  title: string;
  hint?: string;
  heading: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
        {title}
      </h1>
      {hint && <p className="mt-2 text-sm text-white/60">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label: text, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className={label}>{text}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
        checked ? "border-accent bg-accent/15 text-accent" : "border-white/20 text-white/70"
      }`}
    >
      {checked ? "✓ " : ""}
      {children}
    </button>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-sm ${
        on ? "border-accent bg-accent text-black" : "border-white/30"
      }`}
      aria-hidden
    >
      {on ? "✓" : ""}
    </span>
  );
}
