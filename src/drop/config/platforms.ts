// Drop : plateformes sociales proposées à la création d'une sortie.
// Une tâche n'est générée que si au moins une de ses plateformes est cochée ;
// les plateformes d'une tâche viennent de ses formats (formats.ts).
import type { Platform } from "./schema";

export const PLATFORMS: Platform[] = [
  { id: "tiktok", label: "TikTok", short: "TT" },
  { id: "instagram", label: "Instagram", short: "IG" },
  { id: "youtube", label: "YouTube Shorts", short: "YT" },
];
