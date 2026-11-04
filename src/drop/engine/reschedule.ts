// Drop : recalage d'un planning existant (date de sortie, plateformes, inventaire ou module admin modifiés).
// Fonction pure : elle calcule un aperçu des changements ; c'est l'appelant qui les applique.
// Règles : seules les tâches générées, non publiées et non déplacées à la main bougent ;
// statuts, notes et liens ne sont jamais touchés ; une tâche commencée n'est jamais retirée.
import type { DropConfig } from "../config/index";
import type { StatusId } from "../config/schema";
import { generatePlan } from "./generate";
import type { Plan, PlanInput, PlannedTask } from "./types";

export interface ExistingTask {
  id: string;
  /** Clé du plan (PlannedTask.key) ; null = tâche ajoutée à la main, jamais touchée. */
  key: string | null;
  status: StatusId;
  dueDate: string;
  /** Date déplacée à la main par l'artiste. */
  dateLocked: boolean;
}

export interface RescheduleOptions {
  /** Case « Recaler également les tâches que j'ai déplacées ». */
  includeLocked?: boolean;
  /** Clés des tâches supprimées par l'artiste : jamais recréées. */
  dismissedKeys?: string[];
}

export interface ReschedulePreview {
  plan: Plan;
  moves: { id: string; key: string; from: string; to: string }[];
  additions: PlannedTask[];
  removals: { id: string; key: string }[];
  /** Tâches déplacées à la main qui bougeraient si la case était cochée. */
  lockedSkipped: number;
  /** Phrase de l'aperçu : « 12 tâches déplacées, 2 ajoutées, 1 retirée ». */
  summary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export function summarize(moves: number, additions: number, removals: number) {
  if (moves + additions + removals === 0) return "Aucun changement dans le planning.";
  return `${plural(moves, "tâche")} ${moves > 1 ? "déplacées" : "déplacée"}, ${additions} ${additions > 1 ? "ajoutées" : "ajoutée"}, ${removals} ${removals > 1 ? "retirées" : "retirée"}`;
}

export function reschedule(
  existing: ExistingTask[],
  input: PlanInput,
  config: DropConfig,
  today: string,
  options: RescheduleOptions = {},
): ReschedulePreview {
  const plan = generatePlan(input, config, today);
  const byKey = new Map(plan.tasks.map((t) => [t.key, t]));
  const existingKeys = new Set(existing.map((t) => t.key).filter((k): k is string => k !== null));
  const dismissed = new Set(options.dismissedKeys ?? []);

  const moves: ReschedulePreview["moves"] = [];
  const removals: ReschedulePreview["removals"] = [];
  let lockedSkipped = 0;

  for (const task of existing) {
    if (task.key === null || task.status === "publie") continue;
    const target = byKey.get(task.key);
    if (target) {
      if (target.dueDate === task.dueDate) continue;
      if (task.dateLocked && !options.includeLocked) {
        lockedSkipped++;
        continue;
      }
      moves.push({ id: task.id, key: task.key, from: task.dueDate, to: target.dueDate });
    } else if (task.status === "a_produire" && (!task.dateLocked || options.includeLocked)) {
      removals.push({ id: task.id, key: task.key });
    }
  }

  const additions = plan.tasks.filter((t) => !existingKeys.has(t.key) && !dismissed.has(t.key));
  return { plan, moves, additions, removals, lockedSkipped, summary: summarize(moves.length, additions.length, removals.length) };
}
