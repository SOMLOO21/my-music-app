"use client";
// Drop : page publique d'une sortie (lien de partage). Feuille de route et calendrier en lecture seule,
// sans notes, liens de fichiers ni sous-étapes (le serveur ne les envoie pas).
import { useCallback, useState } from "react";
import { MODE_LABELS, TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import type { PublicRelease as PublicData, Task, Track } from "@/drop/types";
import Calendar from "./Calendar";
import Roadmap from "./Roadmap";
import TaskSheet from "./TaskSheet";

const noop = () => {};

export default function PublicRelease({ data, today }: { data: PublicData; today: string }) {
  const { release } = data;
  const tasks: Task[] = data.tasks.map((t) => ({ ...t, release_id: "", plan_key: null, notes: null, link_url: null, checklist: [] }));
  const tracks: Track[] = data.tracks.map((t) => ({ ...t, release_id: "", clip_release_date: null }));
  const trackTitles = Object.fromEntries(tracks.map((t) => [t.id, t.title]));
  const [tab, setTab] = useState<"feuille" | "calendrier">("feuille");
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), [setOpenId]);
  const open = tasks.find((t) => t.id === openId);
  const done = tasks.filter((t) => t.status === "publie").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <>
      <header className="mb-4">
        <p className="text-xs text-white/50">
          {TYPE_LABELS[release.type]} · {release.artist_name} · sortie le {frShortDate(release.release_date)} · lecture seule
        </p>
        <h1 className="mt-1 text-2xl font-bold">{release.title}</h1>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <p className="text-3xl font-bold tracking-tight">
            {countdownLabel(release.release_date, today)}
            <span className="ml-2 align-middle text-sm font-semibold text-accent">Mode {MODE_LABELS[release.mode]}</span>
          </p>
          <p className="text-sm text-white/60">
            {progress} % · {done}/{tasks.length} étapes
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Progression : ${progress} %`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <nav className="mb-4 flex gap-2" role="tablist" aria-label="Vues de la sortie">
        {(["feuille", "calendrier"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === k ? "bg-accent text-black" : "border border-white/15 text-white/70"}`}
          >
            {k === "feuille" ? "Feuille de route" : "Calendrier"}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === "feuille" ? (
          <div className="mx-auto max-w-3xl">
            <Roadmap tasks={tasks} today={today} releaseDate={release.release_date} warnings={[]} trackTitles={trackTitles} onOpen={(t) => setOpenId(t.id)} />
          </div>
        ) : (
          <Calendar
            tasks={tasks}
            tracks={tracks}
            today={today}
            releaseDate={release.release_date}
            canEdit={false}
            onOpen={(t) => setOpenId(t.id)}
            onChangeDate={noop}
          />
        )}
      </div>

      {open && (
        <TaskSheet
          key={open.id}
          task={open}
          today={today}
          trackTitle={open.track_id ? (trackTitles[open.track_id] ?? null) : null}
          canEdit={false}
          isOwner={false}
          onClose={close}
          onPatch={noop}
          onDuplicate={noop}
          onDelete={noop}
        />
      )}
    </>
  );
}
