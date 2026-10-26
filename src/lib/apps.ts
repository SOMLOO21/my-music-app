// Les apps de la plateforme My Music App. Pour en ajouter une : une ligne ici
// (et sa page dans src/app/<chemin>).
export interface MusicApp {
  name: string;
  description: string;
  href: string;
  emoji: string;
  /** Couleur de fond de la tuile. */
  color: string;
}

export const APPS: MusicApp[] = [
  {
    name: "Inspire",
    description: "Les meilleures idées de contenu TikTok et Reels pour tes sorties, sélectionnées par Mymusicads.",
    href: "/inspire",
    emoji: "💡",
    color: "#c8ff3d",
  },
];
