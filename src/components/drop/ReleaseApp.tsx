"use client";
// Drop : page d'une sortie. En-tête commun, onglets, filtre par titre (EP/Album) et fiche tâche.
// Les tâches vivent dans un seul état : une modification dans une vue apparaît dans les autres.
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  deleteTask,
  getReleaseView,
  duplicateTask,
  patchTask,
  reorder,
  type NewTaskBody,
  type TaskPatchBody,
} from "@/drop/api";
import { diffDays } from "@/drop/engine/dates";
import { MODE_LABELS, TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import type { ReleaseView, Task } from "@/drop/types";
import Calendar from "./Calendar";
import Kanban, { type MoveItem } from "./Kanban";
import NewTaskForm from "./NewTaskForm";
import Roadmap from "./Roadmap";
import Settings from "./Settings";
import { secondary } from "./styles";
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
  const [release, setRelease] = useState(view.release);
  const [tracks, setTracks] = useState(view.tracks);
  const [tasks, setTasks] = useState<Task[]>(view.tasks);
  const [error, setError] = useState<string | null>(null);
  const canEdit = view.role !== "viewer";

  /** Mise à jour optimiste : l'écran change tout de suite, et revient en arrière si l'enregistrement échoue. */
  const optimistic = (change: (list: Task[]) => Task[], request: () => Promise<unknown>) => {
    const previous = tasks;
    setTasks(change(tasks));
    setError(null);
    request().catch((e: Error) => {
      setTasks(previous);
      setError(e.message);
    });
  };

  const move = (items: MoveItem[]) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    optimistic(
      (list) =>
        list.map((t) =>
          byId.has(t.id)
            ? {
                ...t,
                status: byId.get(t.id)!.status,
                position: byId.get(t.id)!.position,
              }
            : t,
        ),
      () => reorder(release.id, items),
    );
  };

  /** Calendrier : nouvelle date, verrouillée (le recalage n'y touchera plus). */
  const changeDate = (task: Task, dueDate: string) => {
    if (task.due_date === dueDate) return;
    const offset = task.offset_days === null ? null : task.offset_days + diffDays(task.due_date, dueDate);
    optimistic(
      (list) => list.map((t) => (t.id === task.id ? { ...t, due_date: dueDate, date_locked: true, offset_days: offset } : t)),
      () => patchTask(task.id, { dueDate }),
    );
  };
  /** Fiche tâche : application locale du changement, puis version enregistrée renvoyée par le serveur. */
  const patch = (task: Task, body: TaskPatchBody) => {
    const local: Partial<Task> = {};
    if (body.title !== undefined) local.title = body.title;
    if (body.status !== undefined) {
      local.status = body.status;
      local.completed_at = body.status === "publie" ? (task.completed_at ?? new Date().toISOString()) : null;
    }
    if (body.dueDate !== undefined && body.dueDate !== task.due_date) {
      local.due_date = body.dueDate;
      local.date_locked = true;
      local.offset_days = task.offset_days === null ? null : task.offset_days + diffDays(task.due_date, body.dueDate);
    }
    if (body.notes !== undefined) local.notes = body.notes;
    if (body.linkUrl !== undefined) local.link_url = body.linkUrl || null;
    if (body.checklist !== undefined) local.checklist = body.checklist;
    optimistic(
      (list) => list.map((t) => (t.id === task.id ? { ...t, ...local } : t)),
      async () => {
        const saved = await patchTask(task.id, body);
        setTasks((list) => list.map((t) => (t.id === saved.id ? saved : t)));
      },
    );
  };

  const duplicate = async (task: Task) => {
    try {
      const copy = await duplicateTask(task.id);
      setTasks((list) => [...list, copy]);
      setOpenId(copy.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (task: Task) => {
    setOpenId(null);
    optimistic(
      (list) => list.filter((t) => t.id !== task.id),
      () => deleteTask(task.id),
    );
  };

  const [adding, setAdding] = useState(false);
  const add = async (body: NewTaskBody) => {
    const task = await createTask(release.id, body);
    setTasks((list) => [...list, task].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setAdding(false);
    setNotice(`« ${task.title} » ajoutée au ${frShortDate(task.due_date)}.`);
  };

  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<ReleaseTab>(initialTab);
  const [trackFilter, setTrackFilter] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const trackTitles = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t.title])), [tracks]);
  const visible = useMemo(
    () => (trackFilter === ALL ? tasks : tasks.filter((t) => (trackFilter === PROJECT ? t.track_id === null : t.track_id === trackFilter))),
    [tasks, trackFilter],
  );
  const done = tasks.filter((t) => t.status === "publie").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const openTask = openId ? (tasks.find((t) => t.id === openId) ?? null) : null;
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

      {tab !== "parametres" && (canEdit || tracks.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {tracks.length > 0 ? (
            <label className="flex flex-1 items-center gap-2 text-sm text-white/60">
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
          ) : (
            <span />
          )}
          {canEdit && (
            <button type="button" className={secondary} onClick={() => setAdding(true)}>
              + Ajouter une tâche
            </button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent/10 px-4 py-2 text-sm text-white/90">
          {notice}
          <button type="button" className="min-h-11 px-2 text-white/60" onClick={() => setNotice(null)} aria-label="Fermer le message">
            ✕
          </button>
        </p>
      )}

      <div role="tabpanel">
        {tab === "feuille" && (
          <div className="mx-auto max-w-3xl">
            <Roadmap
              tasks={visible}
              today={today}
              releaseDate={release.release_date}
              warnings={release.warnings}
              trackTitles={trackTitles}
              onOpen={(t) => setOpenId(t.id)}
            />
          </div>
        )}
        {tab === "kanban" && (
          <Kanban tasks={visible} today={today} trackTitles={trackTitles} canEdit={canEdit} onOpen={(t) => setOpenId(t.id)} onMove={move} />
        )}
        {tab === "calendrier" && (
          <Calendar
            tasks={visible}
            tracks={tracks}
            today={today}
            releaseDate={release.release_date}
            canEdit={canEdit}
            onOpen={(t) => setOpenId(t.id)}
            onChangeDate={changeDate}
          />
        )}
        {tab === "parametres" && (
          <Settings
            release={release}
            today={today}
            isOwner={view.role === "owner"}
            onApplied={async (summary) => {
              const fresh = await getReleaseView(release.id);
              setRelease(fresh.release);
              setTracks(fresh.tracks);
              setTasks(fresh.tasks);
              setNotice(`Planning recalé : ${summary}.`);
              selectTab("feuille");
              router.refresh();
            }}
          />
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          <span>{error} Le changement a été annulé.</span>
          <button type="button" onClick={() => setError(null)} className="min-h-11 shrink-0 px-2" aria-label="Fermer le message">
            ✕
          </button>
        </div>
      )}

      {openTask && (
        <TaskSheet
          key={openTask.id}
          task={openTask}
          today={today}
          trackTitle={openTask.track_id ? trackTitles[openTask.track_id] : null}
          canEdit={canEdit}
          isOwner={view.role === "owner"}
          onClose={close}
          onPatch={patch}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      )}
      {adding && (
        <NewTaskForm today={today} platforms={release.platforms} tracks={tracks} onCancel={() => setAdding(false)} onCreate={add} />
      )}
    </>
  );
}
