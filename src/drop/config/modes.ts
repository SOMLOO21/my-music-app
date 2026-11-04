// Drop : paramètres généraux du moteur de planning.
// Tu peux modifier les chiffres et les phrases ci-dessous sans toucher au reste du code.
// Après une modification, lance « npm run test:drop » : le test signale toute erreur.
import type { Settings } from "./schema";

export const SETTINGS: Settings = {
  // Les 4 modes, du plus confortable au plus serré.
  // Le moteur prend le premier mode dont le délai minimum est atteint (D = jours avant la sortie).
  modes: [
    {
      id: "confort",
      label: "Confort",
      minDays: 42, // 42 jours ou plus
      includes: [{ priority: "essentielle" }, { priority: "recommandee" }, { priority: "bonus" }],
      explanation: "Tu as le temps : toutes les étapes sont prévues à leur date idéale, bonus compris.",
    },
    {
      id: "standard",
      label: "Standard",
      minDays: 21, // 21 à 41 jours
      includes: [{ priority: "essentielle" }, { priority: "recommandee" }],
      explanation: "Le planning garde l'essentiel et le recommandé. Les bonus sont laissés de côté.",
    },
    {
      id: "express",
      label: "Express",
      minDays: 7, // 7 à 20 jours
      includes: [{ priority: "essentielle" }, { priority: "recommandee", modules: ["reseaux"] }],
      explanation:
        "Le délai est court : les étapes sont resserrées et on garde l'essentiel, plus les contenus recommandés pour les réseaux.",
    },
    {
      id: "urgence",
      label: "Urgence",
      minDays: null, // 0 à 6 jours (et sortie déjà passée)
      includes: [{ priority: "essentielle" }],
      explanation: "La sortie arrive très vite : seules les étapes essentielles sont gardées, au plus près d'aujourd'hui.",
    },
  ],

  // Nombre maximum de tâches « Réseaux » le même jour avant la sortie.
  maxSocialTasksPerDay: 2,

  // Durée de la phase « Faire vivre » après la sortie, en jours.
  postReleaseDays: 28,

  // Ce que fait le moteur d'une tâche qui ne tient plus dans le délai :
  // "today" = la placer aujourd'hui avec une alerte ; "drop" = ne pas la générer et expliquer pourquoi.
  // Les exceptions (pitch Spotify, pitch médias) sont indiquées directement dans les modèles.
  defaultIfTooLate: "today",

  // EP et album : plannings en cascade des singles extraits.
  ep: {
    lastSingleOffset: -21, // le dernier single sort 21 jours avant l'EP
    singleSpacingDays: 28, // les singles précédents, tous les 28 jours avant
    truncatePostReleaseAtNextRelease: true, // l'après-sortie d'un single s'arrête au single suivant
    perTrackSpacingDays: 2, // tâches « par titre » (track-by-track…) : une tous les 2 jours
    minDaysBeforeSingle: 7, // alerte si un single proposé tombe à moins de 7 jours d'aujourd'hui
    minTracks: 2,
    maxTracks: 20,
  },
};
