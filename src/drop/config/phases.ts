// Drop : les 4 phases de la feuille de route, des modules et des priorités.
// La phase d'une tâche est déduite de son J idéal, puis ne change plus, même si le planning est resserré.
import type { Phase } from "./schema";

export const PHASES: Phase[] = [
  {
    id: "preparer",
    label: "Préparer",
    from: null, // J-42 et avant
    to: -22,
    message: "On prépare le terrain : son, visuels, stock de contenus.",
  },
  {
    id: "annoncer",
    label: "Annoncer",
    from: -21,
    to: -1,
    message: "On crée l'attente et on fait pré-saver.",
  },
  {
    id: "sortir",
    label: "Sortir",
    from: 0,
    to: 0,
    message: "Le jour J : tout le monde doit savoir que c'est sorti.",
  },
  {
    id: "faire_vivre",
    label: "Faire vivre",
    from: 1,
    to: null, // J+1 à J+28 (voir postReleaseDays dans modes.ts)
    message: "On relance, on recycle ce qui marche, on prépare la suite.",
  },
];

// Modules : « optional » = l'artiste peut le désactiver à la création (seul l'admin l'est).
export const MODULES = [
  { id: "production", label: "Production", optional: false },
  { id: "admin", label: "Admin", optional: true },
  { id: "reseaux", label: "Réseaux", optional: false },
  { id: "promo", label: "Promo", optional: false },
] as const;

export const PRIORITIES = [
  { id: "essentielle", label: "Essentielle" },
  { id: "recommandee", label: "Recommandée" },
  { id: "bonus", label: "Bonus" },
] as const;
