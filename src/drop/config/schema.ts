// Drop : forme attendue de chaque fichier de configuration (schémas zod).
// Ce fichier est technique : pour changer les règles, modifie plutôt modes.ts, phases.ts,
// formats.ts, assets.ts ou templates/*.ts. Le test « npm run test:drop » vérifie que tout est cohérent.
import { z } from "zod";

// --- Listes fermées ------------------------------------------------------------

export const PLATFORM_IDS = ["tiktok", "instagram", "youtube"] as const;
export const MODULE_IDS = ["production", "admin", "reseaux", "promo"] as const;
export const PRIORITY_IDS = ["essentielle", "recommandee", "bonus"] as const;
export const PHASE_IDS = ["preparer", "annoncer", "sortir", "faire_vivre"] as const;
export const MODE_IDS = ["confort", "standard", "express", "urgence"] as const;
export const RELEASE_TYPES = ["single", "clip", "ep", "album"] as const;
export const STATUS_IDS = ["a_produire", "pret", "programme", "publie"] as const;

export const platformId = z.enum(PLATFORM_IDS);
export const moduleId = z.enum(MODULE_IDS);
export const priorityId = z.enum(PRIORITY_IDS);
export const phaseId = z.enum(PHASE_IDS);
export const modeId = z.enum(MODE_IDS);
export const ifTooLate = z.enum(["drop", "today"]);

const id = z.string().regex(/^[a-z0-9_]+$/, "identifiant en minuscules, chiffres et _ uniquement");
const text = z.string().trim().min(1);
const offset = z.number().int().min(-120).max(60);

// --- Paramètres généraux (modes.ts) -----------------------------------------------

export const modeSchema = z.object({
  id: modeId,
  label: text,
  /** Délai minimum (en jours avant la sortie) pour ce mode ; null = pas de minimum. */
  minDays: z.number().int().min(0).nullable(),
  /** Tâches retenues : une priorité, éventuellement limitée à certains modules. */
  includes: z
    .array(z.object({ priority: priorityId, modules: z.array(moduleId).min(1).optional() }))
    .min(1),
  /** Phrase affichée dans le récapitulatif. */
  explanation: text,
});

export const settingsSchema = z.object({
  modes: z.array(modeSchema).length(MODE_IDS.length),
  maxSocialTasksPerDay: z.number().int().min(1).max(10),
  postReleaseDays: z.number().int().min(1).max(60),
  defaultIfTooLate: ifTooLate,
  ep: z.object({
    lastSingleOffset: z.number().int().max(-1),
    singleSpacingDays: z.number().int().min(1),
    truncatePostReleaseAtNextRelease: z.boolean(),
    perTrackSpacingDays: z.number().int().min(1),
    minDaysBeforeSingle: z.number().int().min(0),
    minTracks: z.number().int().min(1),
    maxTracks: z.number().int().min(1),
  }),
});

// --- Phases, plateformes, formats, inventaire --------------------------------------

export const phaseSchema = z.object({
  id: phaseId,
  label: text,
  /** Bornes du J idéal (incluses) ; null = pas de borne. */
  from: z.number().int().nullable(),
  to: z.number().int().nullable(),
  message: text,
});

export const platformSchema = z.object({ id: platformId, label: text, short: text });

export const formatSchema = z.object({
  id,
  label: text,
  platforms: z.array(platformId).min(1),
  /** Libellé des plateformes tel qu'affiché (ex. « TikTok, Reels, Shorts »). */
  platformsLabel: text,
  specs: text,
});

export const assetSchema = z.object({ id, label: text });

export const moduleSchema = z.object({ id: moduleId, label: text, optional: z.boolean() });
export const prioritySchema = z.object({ id: priorityId, label: text });

// --- Modèles de tâches (templates/*.ts) ---------------------------------------------

export const taskTemplateSchema = z
  .object({
    /** Identifiant stable : ne pas le changer une fois en ligne (il relie les tâches générées au modèle). */
    id,
    /** J idéal : jours par rapport à la sortie (négatif = avant). */
    idealOffset: offset,
    /** J min : date la plus tardive acceptable avant la sortie (null pour les tâches du jour J et d'après). */
    minOffset: offset.nullable(),
    title: text,
    module: moduleId,
    priority: priorityId,
    /** Formats de contenu (formats.ts) ; ils déterminent aussi les plateformes de la tâche. */
    formats: z.array(id),
    /** Idée de contenu concrète. */
    idea: text,
    /** Pourquoi c'est important (2 à 3 phrases). */
    why: text,
    /** Comment le faire : étapes courtes, reprises comme sous-étapes à cocher. */
    how: z.array(text).min(1).max(8),
    /** Contenu de l'inventaire (assets.ts) qui fait démarrer la tâche en « Prêt ». */
    readyIf: id.nullable(),
    /** Que faire si la tâche ne tient plus dans le délai (sinon : réglage par défaut de modes.ts). */
    ifTooLate: ifTooLate.optional(),
    /** EP/Album : une tâche par titre, espacées de perTrackSpacingDays. */
    perTrack: z.boolean().optional(),
    /** Module clip : remplace cette tâche du single quand le clip sort le même jour. */
    replaces: id.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.idealOffset < 0 && t.minOffset === null) {
      ctx.addIssue({ code: "custom", message: "une tâche avant la sortie doit avoir un J min" });
    }
    if (t.idealOffset >= 0 && t.minOffset !== null) {
      ctx.addIssue({ code: "custom", message: "une tâche du jour J ou d'après n'a pas de J min" });
    }
    if (t.minOffset !== null && t.minOffset < t.idealOffset) {
      ctx.addIssue({ code: "custom", message: "le J min doit être plus proche de la sortie que le J idéal" });
    }
  });

export const templateSchema = z.object({
  id: z.enum(["single", "clip", "ep"]),
  label: text,
  tasks: z.array(taskTemplateSchema).min(1),
});

export type Mode = z.infer<typeof modeSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type Format = z.infer<typeof formatSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type Template = z.infer<typeof templateSchema>;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export type ModuleId = (typeof MODULE_IDS)[number];
export type PriorityId = (typeof PRIORITY_IDS)[number];
export type PhaseId = (typeof PHASE_IDS)[number];
export type ModeId = (typeof MODE_IDS)[number];
export type ReleaseType = (typeof RELEASE_TYPES)[number];
export type StatusId = (typeof STATUS_IDS)[number];
