"use client";
// Drop : calendrier. Vue mois sur ordinateur, vue semaine ou liste sur mobile.
// Glisser une tâche sur un autre jour change sa date et la verrouille (le recalage n'y touchera plus).
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useId, useMemo, useState } from "react";
import type { StatusId } from "@/drop/config/schema";
import { addDays, diffDays } from "@/drop/engine/dates";
import { MODULE_COLORS, MODULE_LABELS, STATUS_LABELS, dayLabel, isLate } from "@/drop/labels";
import type { Task, Track } from "@/drop/types";
import { card } from "./styles";
import { ModuleBadge } from "./ui";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const STATUS_ICON: Record<StatusId, string> = { a_produire: "○", pret: "◐", programme: "◷", publie: "✓" };

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
/** 0 = lundi … 6 = dimanche. */
const weekday = (iso: string) => (utc(iso).getUTCDay() + 6) % 7;
const startOfWeek = (iso: string) => addDays(iso, -weekday(iso));
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const shiftMonth = (iso: string, n: number) => {
  const d = utc(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => utc(iso).toLocaleDateString("fr-FR", { ...opts, timeZone: "UTC" });
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Jours marquants : J0 de la sortie, singles et clips d'un EP. */
function markers(releaseDate: string, tracks: Track[]) {
  const m = new Map<string, string[]>();
  const add = (date: string | null, label: string) => date && m.set(date, [...(m.get(date) ?? []), label]);
  add(releaseDate, "J0 · Sortie");
  for (const t of tracks) {
    add(t.single_release_date, `Single : ${t.title}`);
    if (t.has_clip && t.clip_release_date && t.clip_release_date !== t.single_release_date) add(t.clip_release_date, `Clip : ${t.title}`);
  }
  return m;
}

export default function Calendar({
  tasks,
  tracks,
  today,
  releaseDate,
  canEdit,
  onOpen,
  onChangeDate,
}: {
  tasks: Task[];
  tracks: Track[];
  today: string;
  releaseDate: string;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onChangeDate: (task: Task, date: string) => void;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [week, setWeek] = useState(() => startOfWeek(today));
  const [mobileView, setMobileView] = useState<"semaine" | "liste">("semaine");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId();

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) m.set(t.due_date, [...(m.get(t.due_date) ?? []), t]);
    return m;
  }, [tasks]);
  const marks = useMemo(() => markers(releaseDate, tracks), [releaseDate, tracks]);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActiveId(null);
    const task = tasks.find((t) => t.id === String(a.id));
    const target = over ? String(over.id) : "";
    if (!task || !target.startsWith("day:")) return;
    onChangeDate(task, target.slice(4));
  }

  const titleOf = (id: string | number) => tasks.find((t) => t.id === String(id))?.title ?? "la tâche";
  const dayOf = (id: string | number | undefined) => (id ? fmt(String(id).slice(4), { weekday: "long", day: "numeric", month: "long" }) : "");
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `« ${titleOf(a.id)} » saisie.`,
    onDragOver: ({ active: a, over }) => (over ? `« ${titleOf(a.id)} » au-dessus du ${dayOf(over.id)}.` : `« ${titleOf(a.id)} » hors du calendrier.`),
    onDragEnd: ({ active: a, over }) => (over ? `« ${titleOf(a.id)} » déplacée au ${dayOf(over.id)}.` : `« ${titleOf(a.id)} » reposée à sa date.`),
    onDragCancel: ({ active: a }) => `Déplacement de « ${titleOf(a.id)} » annulé.`,
  };

  // Grille du mois : du lundi de la 1re semaine au dimanche de la dernière.
  const gridStart = startOfWeek(month);
  const monthEnd = addDays(shiftMonth(month, 1), -1);
  const gridDays = Array.from({ length: diffDays(gridStart, addDays(startOfWeek(monthEnd), 6)) + 1 }, (_, i) => addDays(gridStart, i));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const upcoming = [...byDay.keys()].filter((d) => d >= today).sort();
  const overdue = tasks.filter((t) => isLate(t, today));

  const chip = (t: Task, compact = false) => (
    <TaskChip key={t.id} task={t} today={today} disabled={!canEdit} compact={compact} onOpen={onOpen} />
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active: a }) => setActiveId(String(a.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Glisse une tâche sur un autre jour pour changer sa date. Entrée ouvre la fiche.",
        },
      }}
    >
      {/* ---------- Ordinateur : vue mois ---------- */}
      <div className="hidden md:block">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{capital(fmt(month, { month: "long", year: "numeric" }))}</h2>
          <div className="flex gap-2">
            <NavButton onClick={() => setMonth(shiftMonth(month, -1))} label="Mois précédent">
              ←
            </NavButton>
            <NavButton onClick={() => setMonth(monthStart(today))} label="Revenir à aujourd'hui">
              Aujourd&apos;hui
            </NavButton>
            <NavButton onClick={() => setMonth(monthStart(releaseDate))} label="Aller au jour de la sortie">
              J0
            </NavButton>
            <NavButton onClick={() => setMonth(shiftMonth(month, 1))} label="Mois suivant">
              →
            </NavButton>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-zinc-950 px-2 py-1.5 text-center text-xs font-semibold text-white/50">
              {d}
            </div>
          ))}
          {gridDays.map((day) => {
            const items = byDay.get(day) ?? [];
            return (
              <DayCell
                key={day}
                day={day}
                today={today}
                outside={day.slice(0, 7) !== month.slice(0, 7)}
                marks={marks.get(day)}
                className="min-h-28 p-1.5"
              >
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((t) => chip(t, true))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className="w-full rounded px-1 text-left text-[11px] font-semibold text-white/60 hover:text-white"
                    >
                      + {items.length - 3} autre{items.length - 3 > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </DayCell>
            );
          })}
        </div>
        {selectedDay && (
          <div className={`${card} mt-4`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{capital(fmt(selectedDay, { weekday: "long", day: "numeric", month: "long" }))}</h3>
              <button type="button" onClick={() => setSelectedDay(null)} className="min-h-11 px-3 text-sm text-white/60 hover:text-white">
                Fermer ✕
              </button>
            </div>
            <div className="space-y-1.5">{(byDay.get(selectedDay) ?? []).map((t) => chip(t))}</div>
          </div>
        )}
        <Legend />
      </div>

      {/* ---------- Mobile : semaine ou liste ---------- */}
      <div className="md:hidden">
        <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Affichage du calendrier">
          {(["semaine", "liste"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mobileView === v}
              onClick={() => setMobileView(v)}
              className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${mobileView === v ? "bg-white text-black" : "border border-white/15 text-white/70"}`}
            >
              {v === "semaine" ? "Semaine" : "Liste"}
            </button>
          ))}
        </div>

        {mobileView === "semaine" ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <NavButton onClick={() => setWeek(addDays(week, -7))} label="Semaine précédente">
                ←
              </NavButton>
              <p className="text-center text-sm font-semibold">
                {fmt(week, { day: "numeric", month: "short" })} – {fmt(addDays(week, 6), { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <NavButton onClick={() => setWeek(addDays(week, 7))} label="Semaine suivante">
                →
              </NavButton>
            </div>
            <div className="mb-3 flex justify-center gap-2">
              <NavButton onClick={() => setWeek(startOfWeek(today))} label="Revenir à cette semaine">
                Aujourd&apos;hui
              </NavButton>
              <NavButton onClick={() => setWeek(startOfWeek(releaseDate))} label="Aller à la semaine de la sortie">
                Semaine J0
              </NavButton>
            </div>
            <div className="space-y-2">
              {weekDays.map((day) => (
                <DayCell key={day} day={day} today={today} marks={marks.get(day)} className="rounded-2xl border border-white/10 p-2" long>
                  <div className="mt-1 space-y-1.5">
                    {(byDay.get(day) ?? []).length === 0 ? (
                      <p className="px-1 text-xs text-white/50">—</p>
                    ) : (
                      (byDay.get(day) ?? []).map((t) => chip(t))
                    )}
                  </div>
                </DayCell>
              ))}
            </div>
            {canEdit && <p className="mt-3 text-center text-xs text-white/50">Appui long sur une tâche pour la glisser sur un autre jour.</p>}
          </>
        ) : (
          <div className="space-y-4">
            {overdue.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-red-200/80">À rattraper</h3>
                <div className="space-y-1.5">{overdue.map((t) => chip(t))}</div>
              </section>
            )}
            {upcoming.map((day) => (
              <section key={day}>
                <h3 className={`mb-1.5 text-sm font-semibold ${day === releaseDate ? "text-accent" : ""}`}>
                  {capital(fmt(day, { weekday: "long", day: "numeric", month: "long" }))} · {dayLabel(day, today)}
                  {marks.get(day) && <span className="ml-2 text-xs text-accent">{marks.get(day)!.join(" · ")}</span>}
                </h3>
                <div className="space-y-1.5">{(byDay.get(day) ?? []).map((t) => chip(t))}</div>
              </section>
            ))}
            {upcoming.length === 0 && overdue.length === 0 && <p className="text-sm text-white/50">Plus aucune étape à venir.</p>}
          </div>
        )}
        <Legend />
      </div>

      <DragOverlay>{active ? <ChipBody task={active} today={today} lifted /> : null}</DragOverlay>
    </DndContext>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="min-h-11 min-w-11 rounded-full border border-white/15 px-3 text-sm font-semibold text-white/80 hover:border-white/40"
    >
      {children}
    </button>
  );
}

function DayCell({
  day,
  today,
  outside = false,
  marks,
  long = false,
  className = "",
  children,
}: {
  day: string;
  today: string;
  outside?: boolean;
  marks?: string[];
  long?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const isToday = day === today;
  const isRelease = marks?.some((m) => m.startsWith("J0"));
  return (
    <div
      ref={setNodeRef}
      data-day={day}
      className={`${className} transition ${isOver ? "bg-accent/15" : isRelease ? "bg-accent/10" : "bg-zinc-950"} ${outside ? "opacity-40" : ""} ${
        isRelease ? "ring-2 ring-inset ring-accent" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
            isToday ? "bg-white text-black" : "text-white/70"
          }`}
        >
          {long ? capital(fmt(day, { weekday: "short", day: "numeric" })) : Number(day.slice(8))}
        </span>
        {marks && <span className="truncate text-[10px] font-bold text-accent">{marks.join(" · ")}</span>}
      </div>
      {children}
    </div>
  );
}

function TaskChip({
  task,
  today,
  disabled,
  compact = false,
  onOpen,
}: {
  task: Task;
  today: string;
  disabled: boolean;
  compact?: boolean;
  onOpen: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
        else listeners?.onKeyDown?.(e);
      }}
      style={{ touchAction: disabled ? undefined : "manipulation" }}
      aria-roledescription={disabled ? undefined : "tâche déplaçable"}
      className={`rounded-md focus-visible:outline-2 focus-visible:outline-accent ${isDragging ? "opacity-30" : ""}`}
    >
      <ChipBody task={task} today={today} compact={compact} />
    </div>
  );
}

function ChipBody({ task, today, compact = false, lifted = false }: { task: Task; today: string; compact?: boolean; lifted?: boolean }) {
  const late = isLate(task, today);
  const done = task.status === "publie";
  return (
    <div
      className={`flex cursor-pointer select-none items-start gap-1.5 rounded-md border-l-[3px] bg-white/5 hover:bg-white/10 ${
        compact ? "px-1.5 py-1" : "px-2.5 py-2"
      } ${lifted ? "bg-zinc-800 shadow-2xl ring-1 ring-accent" : ""}`}
      style={{ borderLeftColor: MODULE_COLORS[task.module] }}
      title={`${task.title} · ${MODULE_LABELS[task.module]} · ${STATUS_LABELS[task.status]}`}
    >
      <span aria-label={STATUS_LABELS[task.status]} className={`shrink-0 text-[11px] ${done ? "text-accent" : late ? "text-red-300" : "text-white/60"}`}>
        {STATUS_ICON[task.status]}
      </span>
      <span
        className={`min-w-0 flex-1 leading-snug ${compact ? "truncate text-[11px]" : "text-sm"} ${done ? "text-white/50 line-through" : ""} ${
          late ? "text-red-200" : ""
        }`}
      >
        {task.title}
      </span>
      {!compact && <ModuleBadge module={task.module} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/50">
      {(Object.keys(MODULE_COLORS) as (keyof typeof MODULE_COLORS)[]).map((m) => (
        <span key={m} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: MODULE_COLORS[m] }} aria-hidden />
          {MODULE_LABELS[m]}
        </span>
      ))}
      <span>
        {(Object.keys(STATUS_ICON) as StatusId[]).map((s) => `${STATUS_ICON[s]} ${STATUS_LABELS[s]}`).join("  ")}
      </span>
    </div>
  );
}
