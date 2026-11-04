// Drop : libellés affichés dans l'interface (tirés de la configuration quand elle les contient).
import { DROP_CONFIG } from "./config/index";
import type { ModeId, ModuleId, PhaseId, PlatformId, ReleaseType, StatusId } from "./config/schema";
import { diffDays, jLabel } from "./engine/dates";

export const TYPE_LABELS: Record<ReleaseType, string> = { single: "Single", clip: "Clip", ep: "EP", album: "Album" };

export const STATUS_LABELS: Record<StatusId, string> = {
  a_produire: "À produire",
  pret: "Prêt",
  programme: "Programmé",
  publie: "Publié",
};

export const MODE_LABELS = Object.fromEntries(DROP_CONFIG.settings.modes.map((m) => [m.id, m.label])) as Record<ModeId, string>;
export const MODULE_LABELS = Object.fromEntries(DROP_CONFIG.modules.map((m) => [m.id, m.label])) as Record<ModuleId, string>;
export const PHASE_LABELS = Object.fromEntries(DROP_CONFIG.phases.map((p) => [p.id, p.label])) as Record<PhaseId, string>;
export const PLATFORM_LABELS = Object.fromEntries(DROP_CONFIG.platforms.map((p) => [p.id, p.label])) as Record<PlatformId, string>;

/** Compte à rebours d'une sortie : « J-18 », « J0 », « J+3 ». */
export const countdownLabel = (releaseDate: string, today: string) => jLabel(diffDays(releaseDate, today));

export const frShortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
