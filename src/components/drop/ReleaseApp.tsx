"use client";
// Drop : page d'une sortie. En-tête commun, onglets, filtre par titre (EP/Album) et fiche tâche.
// Les tâches vivent dans un seul état : une modification dans une vue apparaît dans les autres.
import { useCallback, useMemo, useState } from "react";
import { MODE_LABELS, TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import type { ReleaseView, Task } from "@/drop/types";
import Roadmap from "./Roadmap";
import TaskSheet from "./TaskSheet";

const TABS = [
  { key: "feuille", label: "Feuille de route" },
  { key: "kanban", label: "Kanban" },
  { key: "calendrier", label: "Calendrier" },
  { key: "parametres", label: "Paramètres" },
] as const;
export type ReleaseTab = (typeof TABS)[number]["key"];

/** Filtre EP/Album : tout, le projet seul, ou un titre. */
const ALL = "__all";
const PROJECT = "__project";

export default function ReleaseApp({ view, today, initialTab }: { view: ReleaseView; today: string; initialTab: ReleaseTab }) {
  const { release, tracks } = view;
  const [tasks] = useState<Task[]>(view.tasks);
  const [tab, setTab] = useState<ReleaseTab>(initialTab);
  const [trackFilter, setTrackFilter] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const trackTitles = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t.title])), [tracks]);
  const visible = useMemo(
    () =>
      trackFilter === ALL ? tasks : tasks.filter((t) => (trackFilter === PROJECT ? t.track_id === null : t.track_id === trackFilter)),
    [tasks, trackFilter],
  );
  const done = tasks.filter((t) => t.status === "publie").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;
  const close = useCallback(() => setOpenId(null), []);

  const selectTab = (key: ReleaseTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === "feuille") url.searchParams.delete("vue");
    else url.searchParams.set("vue", key);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <header className="mb-4">
        <p className="text-xs text-white/50">
          {TYPE_LABELS[release.type]} · {release.artist_name} · sortie le {frShortDate(release.release_date)}
          {view.role === "viewer" && " · lecture seule"}
          {view.role === "editor" && " · éditeur"}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <p className="text-3xl font-bold tracking-tight">
            {countdownLabel(release.release_date, today)}
            <span className="ml-2 align-middle text-sm font-semibold text-accent">Mode {MODE_LABELS[release.mode]}</span>
          </p>
          <p className="text-sm text-white/60">
            {progress} % · {done}/{tasks.length} étapes
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Progression globale : ${progress} %`}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" aria-label="Vues de la sortie" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => selectTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
              tab === t.key ? "bg-accent text-black" : "border border-white/15 text-white/70 hover:border-white/40 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tracks.length > 0 && tab !== "parametres" && (
        <label className="mb-4 flex items-center gap-2 text-sm text-white/60">
          <span className="shrink-0">Afficher</span>
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/20 bg-black/40 px-3 text-base text-white sm:w-auto"
          >
            <option value={ALL}>Tout le projet</option>
            <option value={PROJECT}>{TYPE_LABELS[release.type]} seulement</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.position}. {t.title}
                {t.is_focus_single ? " (single)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <div role="tabpanel">
        {tab === "feuille" && (
          <Roadmap
            tasks={visible}
            today={today}
            releaseDate={release.release_date}
            warnings={release.warnings}
            trackTitles={trackTitles}
            onOpen={(t) => setOpenId(t.id)}
          />
        )}
        {tab !== "feuille" && (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
            Cette vue arrive bientôt.
          </p>
        )}
      </div>

      {openTask && (
        <TaskSheet task={openTask} today={today} trackTitle={openTask.track_id ? trackTitles[openTask.track_id] : null} onClose={close} />
      )}
    </>
  );
}
