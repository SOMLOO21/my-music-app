// Drop : inventaire des contenus proposé dans l'assistant (cases à cocher).
// Un contenu coché fait démarrer en « Prêt » les tâches dont le champ readyIf porte son id.
import type { Asset } from "./schema";

export const ASSETS: Asset[] = [
  { id: "cover", label: "Cover finalisée" },
  { id: "press_photos", label: "Photos presse ou portraits" },
  { id: "vertical_videos", label: "Vidéos verticales déjà tournées" },
  { id: "studio_footage", label: "Images de studio (photos ou vidéos)" },
  { id: "clip", label: "Clip terminé" },
  { id: "clip_bts", label: "Images du tournage du clip" },
  { id: "visualizer", label: "Visualizer" },
  { id: "alt_version", label: "Version alternative (acoustique, live, remix)" },
  { id: "press_kit", label: "Press kit" },
];
