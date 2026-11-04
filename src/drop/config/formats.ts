// Drop : formats de contenu, avec leurs plateformes et leurs spécifications.
// « platforms » sert au filtrage : tiktok, instagram (Reels, posts, stories) et youtube (Shorts, YouTube).
import type { Format } from "./schema";

export const FORMATS: Format[] = [
  {
    id: "hook_video",
    label: "Vidéo hook",
    platforms: ["tiktok", "instagram", "youtube"],
    platformsLabel: "TikTok, Reels, Shorts",
    specs: "9:16, 7 à 15 s, le meilleur passage dès la 1re seconde, texte à l'écran",
  },
  {
    id: "face_cam",
    label: "Face cam",
    platforms: ["tiktok", "instagram"],
    platformsLabel: "TikTok, Reels",
    specs: "9:16, 15 à 45 s, l'artiste parle à la caméra",
  },
  {
    id: "behind_scenes",
    label: "Coulisses",
    platforms: ["tiktok", "instagram", "youtube"],
    platformsLabel: "TikTok, Reels, Shorts",
    specs: "9:16, 10 à 30 s, studio ou tournage, son du titre en fond",
  },
  {
    id: "carousel",
    label: "Carrousel",
    platforms: ["instagram", "tiktok"],
    platformsLabel: "Instagram, TikTok (mode photo)",
    specs: "4:5, 5 à 10 visuels, dernier visuel = appel à l'action",
  },
  {
    id: "story",
    label: "Story",
    platforms: ["instagram"],
    platformsLabel: "Instagram",
    specs: "9:16, séquence de 3 à 5, stickers (compte à rebours, sondage, lien)",
  },
  {
    id: "photo_post",
    label: "Post photo ou cover",
    platforms: ["instagram"],
    platformsLabel: "Instagram",
    specs: "4:5 ou 1:1",
  },
  {
    id: "lyrics_video",
    label: "Vidéo paroles",
    platforms: ["tiktok", "instagram", "youtube"],
    platformsLabel: "TikTok, Reels, Shorts",
    specs: "9:16, paroles synchronisées à l'écran",
  },
  {
    id: "trend",
    label: "Trend ou challenge",
    platforms: ["tiktok", "instagram"],
    platformsLabel: "TikTok, Reels",
    specs: "9:16, un geste ou une phrase simple à reproduire sur le hook",
  },
  {
    id: "performance",
    label: "Performance",
    platforms: ["tiktok", "instagram", "youtube"],
    platformsLabel: "TikTok, Reels, Shorts",
    specs: "9:16, live, acoustique ou en situation",
  },
  {
    id: "clip_cut",
    label: "Extrait de clip",
    platforms: ["tiktok", "instagram", "youtube"],
    platformsLabel: "TikTok, Reels, Shorts",
    specs: "9:16, 10 à 20 s, recadré depuis le clip",
  },
  {
    id: "live",
    label: "Live",
    platforms: ["tiktok", "instagram"],
    platformsLabel: "TikTok, Instagram",
    specs: "20 à 60 min",
  },
  {
    id: "youtube_premiere",
    label: "Première YouTube",
    platforms: ["youtube"],
    platformsLabel: "YouTube",
    specs: "clip en 16:9 avec miniature",
  },
];
