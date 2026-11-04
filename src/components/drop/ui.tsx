// Drop : petits éléments d'interface partagés par la feuille de route, le kanban et le calendrier.
import type { ModuleId, PlatformId, StatusId } from "@/drop/config/schema";
import { jLabel } from "@/drop/engine/dates";
import { MODULE_COLORS, MODULE_LABELS, PLATFORM_LABELS, PLATFORM_SHORT, STATUS_LABELS, frShortDate, isLate } from "@/drop/labels";
import type { Task } from "@/drop/types";

export function ModuleBadge({ module }: { module: ModuleId }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${MODULE_COLORS[module]}26`, color: MODULE_COLORS[module] }}
    >
      {MODULE_LABELS[module]}
    </span>
  );
}

export function PlatformBadges({ platforms }: { platforms: PlatformId[] }) {
  if (platforms.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {platforms.map((p) => (
        <span key={p} title={PLATFORM_LABELS[p]} className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/70">
          {PLATFORM_SHORT[p]}
          <span className="sr-only"> {PLATFORM_LABELS[p]}</span>
        </span>
      ))}
    </span>
  );
}

const STATUS_STYLE: Record<StatusId, string> = {
  a_produire: "border-white/25 text-white/70",
  pret: "border-sky-300/50 text-sky-200",
  programme: "border-violet-300/50 text-violet-200",
  publie: "border-accent/60 bg-accent/15 text-accent",
};
const STATUS_ICON: Record<StatusId, string> = { a_produire: "○", pret: "◐", programme: "◷", publie: "✓" };

export function StatusBadge({ status }: { status: StatusId }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Ligne compacte d'une tâche (feuille de route, listes). */
export function TaskRow({
  task,
  today,
  trackTitle,
  onOpen,
  showDate = true,
}: {
  task: Task;
  today: string;
  trackTitle?: string | null;
  onOpen: (task: Task) => void;
  showDate?: boolean;
}) {
  const late = isLate(task, today);
  const done = task.status === "publie";
  const offset = task.offset_days ?? null;
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden
        className={`mt-1 size-2.5 shrink-0 rounded-full ${late ? "bg-red-400" : done ? "bg-accent" : "border border-white/40"}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium leading-snug ${done ? "text-white/40 line-through" : ""}`}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
          {showDate && (
            <span className={late ? "font-semibold text-red-300" : ""}>
              {frShortDate(task.due_date)}
              {offset !== null && ` · ${jLabel(offset)}`}
              {late && " · en retard"}
            </span>
          )}
          <ModuleBadge module={task.module} />
          <PlatformBadges platforms={task.platforms} />
          {trackTitle && <span className="rounded-full bg-white/10 px-2 py-0.5">{trackTitle}</span>}
          {!done && task.status !== "a_produire" && <StatusBadge status={task.status} />}
        </span>
      </span>
    </button>
  );
}
