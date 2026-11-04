// Drop : configuration complète du moteur, rassemblée en un seul objet.
// Pas de validation ici (une erreur de configuration ne doit jamais casser l'app en ligne) :
// c'est le test « npm run test:drop » qui la vérifie, avec validateConfig().
import { ASSETS } from "./assets";
import { FORMATS } from "./formats";
import { SETTINGS } from "./modes";
import { MODULES, PHASES, PRIORITIES } from "./phases";
import { PLATFORMS } from "./platforms";
import {
  assetSchema,
  formatSchema,
  moduleSchema,
  phaseSchema,
  platformSchema,
  prioritySchema,
  settingsSchema,
  templateSchema,
  MODE_IDS,
  PHASE_IDS,
  type PhaseId,
  type PlatformId,
  type TaskTemplate,
} from "./schema";
import { CLIP } from "./templates/clip";
import { EP } from "./templates/ep";
import { SINGLE } from "./templates/single";
import { z } from "zod";

/** À changer à chaque modification des règles : enregistré avec chaque sortie (config_version). */
export const CONFIG_VERSION = "2026-11-v1";

export const DROP_CONFIG = {
  version: CONFIG_VERSION,
  settings: SETTINGS,
  phases: PHASES,
  modules: MODULES,
  priorities: PRIORITIES,
  platforms: PLATFORMS,
  formats: FORMATS,
  assets: ASSETS,
  templates: { single: SINGLE, clip: CLIP, ep: EP },
};

export type DropConfig = typeof DROP_CONFIG;

/** Phase d'une tâche d'après son J idéal. */
export function phaseFor(config: DropConfig, idealOffset: number): PhaseId {
  const phase = config.phases.find((p) => (p.from === null || idealOffset >= p.from) && (p.to === null || idealOffset <= p.to));
  if (!phase) throw new Error(`Aucune phase pour J${idealOffset >= 0 ? "+" : ""}${idealOffset}`);
  return phase.id;
}

/** Plateformes d'une tâche : réunion des plateformes de ses formats (vide = tâche sans plateforme). */
export function platformsFor(config: DropConfig, task: TaskTemplate): PlatformId[] {
  const set = new Set<PlatformId>();
  for (const f of task.formats) for (const p of config.formats.find((x) => x.id === f)?.platforms ?? []) set.add(p);
  return config.platforms.map((p) => p.id).filter((p) => set.has(p));
}

/**
 * Vérifie toute la configuration : forme de chaque fichier, puis cohérence entre fichiers
 * (formats et contenus connus, identifiants uniques, phases sans trou, modes ordonnés…).
 * Renvoie la liste des erreurs, en français ; vide si tout va bien.
 */
export function validateConfig(config: DropConfig = DROP_CONFIG): string[] {
  const errors: string[] = [];
  const check = (where: string, schema: z.ZodType, value: unknown) => {
    const res = schema.safeParse(value);
    if (!res.success) for (const i of res.error.issues) errors.push(`${where} › ${i.path.join(".") || "(racine)"} : ${i.message}`);
  };

  check("modes.ts", settingsSchema, config.settings);
  check("phases.ts", z.array(phaseSchema).length(PHASE_IDS.length), config.phases);
  check("phases.ts (modules)", z.array(moduleSchema), config.modules);
  check("phases.ts (priorités)", z.array(prioritySchema), config.priorities);
  check("platforms.ts", z.array(platformSchema).min(1), config.platforms);
  check("formats.ts", z.array(formatSchema).min(1), config.formats);
  check("assets.ts", z.array(assetSchema).min(1), config.assets);
  for (const [name, t] of Object.entries(config.templates)) check(`templates/${name}.ts`, templateSchema, t);
  if (errors.length) return errors;

  const dupes = (where: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`${where} : identifiant en double « ${i} »`);
      seen.add(i);
    }
  };
  dupes("platforms.ts", config.platforms.map((p) => p.id));
  dupes("formats.ts", config.formats.map((f) => f.id));
  dupes("assets.ts", config.assets.map((a) => a.id));

  // Modes : les 4 présents, du plus long au plus court, le dernier sans minimum.
  const modes = config.settings.modes;
  if (modes.map((m) => m.id).join() !== MODE_IDS.join()) errors.push(`modes.ts : les modes doivent être dans l'ordre ${MODE_IDS.join(", ")}`);
  modes.forEach((m, i) => {
    const last = i === modes.length - 1;
    if (last && m.minDays !== null) errors.push(`modes.ts : le dernier mode (${m.label}) ne doit pas avoir de minimum (null)`);
    if (!last && m.minDays === null) errors.push(`modes.ts : seul le dernier mode peut ne pas avoir de minimum`);
    const next = modes[i + 1];
    if (!last && next.minDays !== null && m.minDays !== null && m.minDays <= next.minDays) {
      errors.push(`modes.ts : le minimum de ${m.label} doit être plus grand que celui de ${next.label}`);
    }
  });
  const { ep } = config.settings;
  if (ep.minTracks > ep.maxTracks) errors.push("modes.ts : ep.minTracks doit être inférieur ou égal à ep.maxTracks");

  // Phases : dans l'ordre, sans trou ni chevauchement, de -∞ à +∞.
  const phases = config.phases;
  if (phases.map((p) => p.id).join() !== PHASE_IDS.join()) errors.push(`phases.ts : les phases doivent être dans l'ordre ${PHASE_IDS.join(", ")}`);
  if (phases[0]?.from !== null) errors.push("phases.ts : la première phase doit commencer sans borne (from: null)");
  if (phases.at(-1)?.to !== null) errors.push("phases.ts : la dernière phase doit finir sans borne (to: null)");
  for (let i = 0; i < phases.length - 1; i++) {
    const a = phases[i].to;
    const b = phases[i + 1].from;
    if (a === null || b === null || b !== a + 1) errors.push(`phases.ts : « ${phases[i].label} » et « ${phases[i + 1].label} » doivent se suivre sans trou`);
  }
  for (const p of phases) if (p.from !== null && p.to !== null && p.from > p.to) errors.push(`phases.ts : « ${p.label} » a un début après sa fin`);
  const sortir = phases.find((p) => p.id === "sortir");
  if (sortir && (sortir.from !== 0 || sortir.to !== 0)) errors.push("phases.ts : la phase « Sortir » doit être exactement J0");

  // Modules : correspond à la liste fermée, seul « admin » est facultatif.
  if (config.modules.find((m) => m.id === "admin")?.optional !== true) errors.push("phases.ts : le module admin doit être facultatif");

  // Modèles : identifiants uniques entre tous les modèles, références connues, cohérence.
  const formatIds = new Set(config.formats.map((f) => f.id));
  const assetIds = new Set(config.assets.map((a) => a.id));
  const all = Object.values(config.templates).flatMap((t) => t.tasks.map((task) => ({ template: t.id, task })));
  dupes("templates", all.map((x) => x.task.id));

  for (const { template, task } of all) {
    const where = `templates/${template}.ts › ${task.id}`;
    for (const f of task.formats) if (!formatIds.has(f)) errors.push(`${where} : format inconnu « ${f} » (voir formats.ts)`);
    if (new Set(task.formats).size !== task.formats.length) errors.push(`${where} : format en double`);
    if (task.readyIf && !assetIds.has(task.readyIf)) errors.push(`${where} : contenu inconnu « ${task.readyIf} » (voir assets.ts)`);
    if (task.idealOffset > config.settings.postReleaseDays) errors.push(`${where} : J+${task.idealOffset} dépasse postReleaseDays`);
    if (task.module === "reseaux" && task.formats.length === 0) errors.push(`${where} : une tâche Réseaux doit avoir au moins un format`);
    if (task.perTrack && template !== "ep") errors.push(`${where} : perTrack n'est possible que dans le modèle EP`);
    if (task.replaces) {
      if (template !== "clip") errors.push(`${where} : replaces n'est possible que dans le module clip`);
      const target = all.find((x) => x.task.id === task.replaces);
      if (!target || target.template !== "single") errors.push(`${where} : replaces doit viser une tâche du modèle Single`);
      else if (target.task.idealOffset !== task.idealOffset) errors.push(`${where} : replaces doit viser une tâche au même J`);
    }
    try {
      phaseFor(config, task.idealOffset);
    } catch (e) {
      errors.push(`${where} : ${(e as Error).message}`);
    }
  }

  // Chaque modèle doit avoir au moins une tâche de sortie (J0).
  for (const t of Object.values(config.templates)) {
    if (!t.tasks.some((x) => x.idealOffset === 0)) errors.push(`templates/${t.id}.ts : aucune tâche le jour J`);
  }
  return errors;
}
