"use client";
// Drop : kanban en 4 colonnes (À produire, Prêt, Programmé, Publié).
// Glisser-déposer à la souris, au doigt (appui long) et au clavier (Espace pour saisir, flèches, Espace pour poser).
// Sur mobile : une colonne à la fois ; on dépose une carte sur un onglet de colonne pour l'y envoyer.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useMemo, useState } from "react";
import { DROP_CONFIG } from "@/drop/config/index";
import { STATUS_IDS, type ModuleId, type PhaseId, type PlatformId, type StatusId } from "@/drop/config/schema";
import { jLabel } from "@/drop/engine/dates";
import { MODULE_LABELS, PHASE_LABELS, PLATFORM_LABELS, STATUS_LABELS, frShortDate, isLate } from "@/drop/labels";
import type { Task } from "@/drop/types";
import { ModuleBadge, PlatformBadges } from "./ui";

export interface MoveItem {
  id: string;
  status: StatusId;
  position: number;
}

const COLUMNS = STATUS_IDS;

/** Ce qui est sous le doigt ou la souris d'abord (onglets de colonne sur mobile), sinon le plus proche. */
const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length > 0 ? under : closestCorners(args);
};
const selectClass = "min-h-11 rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white";

export default function Kanban({
  tasks,
  today,
  trackTitles,
  canEdit,
  onOpen,
  onMove,
}: {
  tasks: Task[];
  today: string;
  trackTitles: Record<string, string>;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onMove: (items: MoveItem[]) => void;
}) {
  const [platform, setPlatform] = useState<PlatformId | "">("");
  const [phase, setPhase] = useState<PhaseId | "">("");
  const [module, setModule] = useState<ModuleId | "">("");
  const [lateOnly, setLateOnly] = useState(false);
  const [mobileCol, setMobileCol] = useState<StatusId>("a_produire");
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId(); // identifiant stable entre serveur et navigateur (sinon erreur d'hydratation)

  const filtered = tasks.filter(
    (t) =>
      (!platform || t.platforms.includes(platform)) &&
      (!phase || t.phase === phase) &&
      (!module || t.module === module) &&
      (!lateOnly || isLate(t, today)),
  );
  const columns = useMemo(() => {
    const out = {} as Record<StatusId, Task[]>;
    for (const s of COLUMNS) {
      out[s] = filtered.filter((t) => t.status === s).sort((a, b) => a.position - b.position || a.due_date.localeCompare(b.due_date));
    }
    return out;
  }, [filtered]);
  const byId = (id: string) => tasks.find((t) => t.id === id);
  const active = activeId ? byId(activeId) : undefined;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const task = byId(String(a.id));
    if (!task) return;
    const overId = String(over.id);
    let target: StatusId;
    let index: number;
    if (overId.startsWith("col:") || overId.startsWith("tab:")) {
      target = overId.slice(4) as StatusId;
      index = columns[target].filter((t) => t.id !== task.id).length;
    } else {
      const overTask = byId(overId);
      if (!overTask) return;
      target = overTask.status;
      index = columns[target].findIndex((t) => t.id === overId);
    }
    let list: Task[];
    if (target === task.status) {
      const from = columns[target].findIndex((t) => t.id === task.id);
      if (from === index || from < 0) return;
      list = arrayMove(columns[target], from, Math.min(index, columns[target].length - 1));
    } else {
      list = columns[target].filter((t) => t.id !== task.id);
      list.splice(index, 0, { ...task, status: target });
    }
    const items = list
      .map((t, position) => ({ id: t.id, status: target, position }))
      .filter((i) => {
        const before = byId(i.id)!;
        return before.status !== i.status || before.position !== i.position;
      });
    if (items.length) onMove(items);
    if (target !== task.status) setMobileCol(target);
  }

  const title = (id: string | number) => byId(String(id))?.title ?? "la carte";
  const colOf = (id: string | number | undefined) => {
    if (id === undefined) return "";
    const s = String(id);
    if (s.startsWith("col:") || s.startsWith("tab:")) return STATUS_LABELS[s.slice(4) as StatusId];
    const t = byId(s);
    return t ? STATUS_LABELS[t.status] : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `« ${title(a.id)} » saisie.`,
    onDragOver: ({ active: a, over }) => (over ? `« ${title(a.id)} » au-dessus de la colonne ${colOf(over.id)}.` : `« ${title(a.id)} » hors des colonnes.`),
    onDragEnd: ({ active: a, over }) => (over ? `« ${title(a.id)} » déposée dans ${colOf(over.id)}.` : `« ${title(a.id)} » reposée à sa place.`),
    onDragCancel: ({ active: a }) => `Déplacement de « ${title(a.id)} » annulé.`,
  };

  return (
    <div>
      {/* Filtres */}
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filtres du kanban">
        <select aria-label="Plateforme" className={selectClass} value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId | "")}>
          <option value="">Toutes plateformes</option>
          {DROP_CONFIG.platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {PLATFORM_LABELS[p.id]}
            </option>
          ))}
        </select>
        <select aria-label="Phase" className={selectClass} value={phase} onChange={(e) => setPhase(e.target.value as PhaseId | "")}>
          <option value="">Toutes phases</option>
          {DROP_CONFIG.phases.map((p) => (
            <option key={p.id} value={p.id}>
              {PHASE_LABELS[p.id]}
            </option>
          ))}
        </select>
        <select aria-label="Module" className={selectClass} value={module} onChange={(e) => setModule(e.target.value as ModuleId | "")}>
          <option value="">Tous modules</option>
          {DROP_CONFIG.modules.map((m) => (
            <option key={m.id} value={m.id}>
              {MODULE_LABELS[m.id]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={lateOnly}
          onClick={() => setLateOnly(!lateOnly)}
          className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
            lateOnly ? "border-red-300 bg-red-400/15 text-red-200" : "border-white/20 text-white/70"
          }`}
        >
          En retard
        </button>
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={({ active: a }) => setActiveId(String(a.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Pour déplacer une carte : Espace pour la saisir, flèches pour la déplacer, Espace pour la poser, Échap pour annuler. Entrée ouvre la fiche.",
          },
        }}
      >
        {/* Mobile : choix de la colonne (onglets où l'on peut aussi déposer une carte) */}
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:hidden" role="tablist" aria-label="Colonne affichée">
          {COLUMNS.map((s) => (
            <ColumnTab key={s} status={s} count={columns[s].length} selected={mobileCol === s} onSelect={() => setMobileCol(s)} dragging={!!activeId} />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {COLUMNS.map((s) => (
            <Column key={s} status={s} hiddenOnMobile={s !== mobileCol} count={columns[s].length}>
              <SortableContext items={columns[s].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {columns[s].length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
                    {canEdit ? "Dépose une carte ici" : "Aucune étape"}
                  </p>
                ) : (
                  columns[s].map((t) => (
                    <SortableCard key={t.id} task={t} today={today} trackTitle={t.track_id ? trackTitles[t.track_id] : null} disabled={!canEdit} onOpen={onOpen} />
                  ))
                )}
              </SortableContext>
            </Column>
          ))}
        </div>

        <DragOverlay>
          {active ? <Card task={active} today={today} trackTitle={active.track_id ? trackTitles[active.track_id] : null} lifted /> : null}
        </DragOverlay>
      </DndContext>
      {canEdit && <p className="mt-4 text-center text-xs text-white/40 md:hidden">Appui long sur une carte pour la déplacer.</p>}
    </div>
  );
}

function ColumnTab({
  status,
  count,
  selected,
  dragging,
  onSelect,
}: {
  status: StatusId;
  count: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${status}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
        isOver ? "scale-105 bg-accent text-black" : selected ? "bg-white text-black" : dragging ? "border border-accent/60 text-white" : "border border-white/15 text-white/70"
      }`}
    >
      {STATUS_LABELS[status]} <span className="opacity-60">{count}</span>
    </button>
  );
}

function Column({ status, count, hiddenOnMobile, children }: { status: StatusId; count: number; hiddenOnMobile: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Colonne ${STATUS_LABELS[status]}`}
      className={`${hiddenOnMobile ? "hidden md:flex" : "flex"} min-h-40 flex-col gap-2 rounded-2xl border p-2 transition ${
        isOver ? "border-accent/60 bg-accent/5" : "border-white/10 bg-zinc-900/60"
      }`}
    >
      <h3 className="flex items-center justify-between px-2 pt-1 text-sm font-semibold">
        {STATUS_LABELS[status]}
        <span className="rounded-full bg-white/10 px-2 text-xs text-white/60">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function SortableCard({
  task,
  today,
  trackTitle,
  disabled,
  onOpen,
}: {
  task: Task;
  today: string;
  trackTitle: string | null;
  disabled: boolean;
  onOpen: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: disabled ? undefined : "manipulation" }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
        else listeners?.onKeyDown?.(e);
      }}
      aria-roledescription={disabled ? undefined : "carte déplaçable"}
      className={`rounded-xl focus-visible:outline-2 focus-visible:outline-accent ${isDragging ? "opacity-30" : ""}`}
    >
      <Card task={task} today={today} trackTitle={trackTitle} />
    </div>
  );
}

function Card({ task, today, trackTitle, lifted = false }: { task: Task; today: string; trackTitle: string | null; lifted?: boolean }) {
  const late = isLate(task, today);
  return (
    <article
      className={`relative cursor-pointer select-none rounded-xl border bg-zinc-900 p-3 ${
        lifted ? "rotate-1 border-accent shadow-2xl shadow-black/60" : "border-white/10 hover:border-white/30"
      } ${late ? "border-l-4 border-l-red-400" : ""}`}
    >
      <p className={`text-sm font-medium leading-snug ${task.status === "publie" ? "text-white/50" : ""}`}>{task.title}</p>
      <p className={`mt-1 text-[11px] ${late ? "font-semibold text-red-300" : "text-white/50"}`}>
        {task.offset_days !== null ? `${jLabel(task.offset_days)} · ` : ""}
        {frShortDate(task.due_date)}
        {late && " · en retard"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ModuleBadge module={task.module} />
        <PlatformBadges platforms={task.platforms} />
        {trackTitle && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{trackTitle}</span>}
      </div>
    </article>
  );
}
