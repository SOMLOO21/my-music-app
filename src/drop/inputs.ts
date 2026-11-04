// Drop : validation (zod) de tout ce qui arrive du navigateur. Les routes et actions serveur
// passent chaque corps de requête par ces schémas avant d'appeler src/drop/repo.ts.
import { z } from "zod";
import { DROP_CONFIG } from "./config/index";
import { MODULE_IDS, PLATFORM_IDS, RELEASE_TYPES, STATUS_IDS } from "./config/schema";
import { isIsoDate } from "./engine/dates";

const isoDate = z.string().refine(isIsoDate, "date invalide (AAAA-MM-JJ)");
const name = (max: number) => z.string().trim().min(1, "champ obligatoire").max(max);
const platforms = z
  .array(z.enum(PLATFORM_IDS))
  .min(1, "coche au moins une plateforme")
  .transform((l) => PLATFORM_IDS.filter((p) => l.includes(p)));
const assetIds = new Set(DROP_CONFIG.assets.map((a) => a.id));
const ownedAssets = z
  .array(z.string().refine((a) => assetIds.has(a), "contenu inconnu"))
  .max(50)
  .transform((l) => [...new Set(l)]);
const linkUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "le lien doit commencer par http:// ou https://")
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const trackInputSchema = z.object({
  title: name(120),
  isSingle: z.boolean().default(false),
  singleReleaseDate: isoDate.nullable().default(null),
  hasClip: z.boolean().default(false),
  clipReleaseDate: isoDate.nullable().default(null),
});

const { minTracks, maxTracks } = DROP_CONFIG.settings.ep;

export const releaseCreateSchema = z
  .object({
    type: z.enum(RELEASE_TYPES),
    title: name(120),
    artistName: name(120),
    releaseDate: isoDate,
    clipIsRelaunch: z.boolean().default(false),
    platforms,
    ownedAssets: ownedAssets.default([]),
    adminEnabled: z.boolean().default(true),
    tracks: z.array(trackInputSchema).max(maxTracks).default([]),
  })
  .superRefine((r, ctx) => {
    const project = r.type === "ep" || r.type === "album";
    if (project && (r.tracks.length < minTracks || r.tracks.length > maxTracks)) {
      ctx.addIssue({ code: "custom", path: ["tracks"], message: `un EP ou un album compte de ${minTracks} à ${maxTracks} titres` });
    }
    if (!project && r.tracks.length > 0) ctx.addIssue({ code: "custom", path: ["tracks"], message: "seuls un EP ou un album ont des titres" });
  });

export const taskPatchSchema = z
  .object({
    title: name(200),
    status: z.enum(STATUS_IDS),
    dueDate: isoDate,
    notes: z.string().max(5000).nullable(),
    linkUrl,
    checklist: z.array(z.object({ label: name(200), done: z.boolean() })).max(30),
    module: z.enum(MODULE_IDS),
    platforms: z.array(z.enum(PLATFORM_IDS)),
    position: z.number().int().min(0).max(100_000),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "aucune modification");

export const taskCreateSchema = z.object({
  title: name(200),
  dueDate: isoDate,
  module: z.enum(MODULE_IDS),
  platforms: z.array(z.enum(PLATFORM_IDS)).default([]),
  notes: z.string().max(5000).nullable().default(null),
  trackId: z.string().max(64).nullable().default(null),
});

/** Paramètres de la sortie : chaque champ fourni déclenche un recalage (avec aperçu). */
export const settingsChangeSchema = z.object({
  releaseDate: isoDate.optional(),
  platforms: platforms.optional(),
  ownedAssets: ownedAssets.optional(),
  adminEnabled: z.boolean().optional(),
  includeLocked: z.boolean().default(false),
});

export const inviteSchema = z.object({
  pseudo: z
    .string()
    .trim()
    .transform((p) => p.replace(/^@/, ""))
    .pipe(z.string().min(3).max(60)),
  role: z.enum(["viewer", "editor"]).default("viewer"),
});

export const memberRoleSchema = z.object({ role: z.enum(["viewer", "editor"]) });

export type ReleaseCreate = z.infer<typeof releaseCreateSchema>;
export type TrackInputData = z.infer<typeof trackInputSchema>;
export type TaskPatch = z.infer<typeof taskPatchSchema>;
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type SettingsChange = z.infer<typeof settingsChangeSchema>;

/** Premier message d'erreur lisible d'une validation zod. */
export function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? issue.message : "Données invalides.";
}
