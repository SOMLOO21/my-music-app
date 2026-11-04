// Drop : types d'entrée et de sortie du moteur de planning.
import type { ModeId, ModuleId, PhaseId, PlatformId, PriorityId, ReleaseType, StatusId } from "../config/schema";

export interface TrackInput {
  /** Identifiant stable du titre (id en base), utilisé dans la clé des tâches. */
  key: string;
  title: string;
  /** Titre choisi comme single extrait. */
  isSingle: boolean;
  /** Date du single (sinon : date proposée par proposeSingleDates). */
  singleReleaseDate: string | null;
  hasClip: boolean;
  /** Date du clip (sinon : date du single, ou de l'EP). */
  clipReleaseDate: string | null;
}

export interface PlanInput {
  type: ReleaseType;
  /** J0 : date de sortie (« AAAA-MM-JJ », jour à Paris). Pour un clip de relance : date du clip. */
  releaseDate: string;
  platforms: PlatformId[];
  /** Contenus déjà disponibles (ids de assets.ts). */
  ownedAssets: string[];
  adminEnabled: boolean;
  /** Clip : true = clip de relance d'un son déjà sorti ; false = single et clip sortent ensemble. */
  clipIsRelaunch?: boolean;
  /** EP/Album : les titres, dans l'ordre. */
  tracks?: TrackInput[];
}

export type WarningCode =
  | "past_release"
  | "too_late_dropped"
  | "too_late_today"
  | "overload"
  | "single_too_soon"
  | "single_after_project";

export interface PlanWarning {
  code: WarningCode;
  message: string;
  taskKey?: string;
}

export interface PlannedTask {
  /** Clé stable de la tâche dans le plan (modèle + titre) : sert au recalage. */
  key: string;
  templateTaskId: string;
  trackKey: string | null;
  trackTitle: string | null;
  title: string;
  phase: PhaseId;
  module: ModuleId;
  priority: PriorityId;
  /** Plateformes de la tâche parmi celles cochées (vide = tâche sans plateforme). */
  platforms: PlatformId[];
  formats: string[];
  status: Extract<StatusId, "a_produire" | "pret">;
  dueDate: string;
  /** J0 de référence de la tâche (date du single, du clip ou de l'EP). */
  anchorDate: string;
  /** Jours par rapport à anchorDate, après adaptation. */
  offsetDays: number;
  idea: string;
  why: string;
  how: string[];
  /** Alerte propre à la tâche (placée aujourd'hui faute de temps). */
  alert: string | null;
}

export interface Plan {
  mode: ModeId;
  /** D : jours entre aujourd'hui et la date de sortie principale. */
  daysLeft: number;
  tasks: PlannedTask[];
  warnings: PlanWarning[];
}
