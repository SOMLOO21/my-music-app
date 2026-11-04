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
  {
    name: "Link",
    description: "Tes smart links Spotify, Apple Music, Deezer, avec le pixel Meta intégré pour suivre tes campagnes.",
    href: "/link",
    emoji: "🔗",
    color: "#a78bfa",
  },
  {
    name: "Syncope",
    description: "Monte des vidéos courtes sur ton son : clips par mood, hooks, paroles calées sur le beat.",
    href: "/syncope",
    emoji: "🎬",
    color: "#f472b6",
  },
  {
    name: "Booking",
    description: "Trouve les lieux qui collent à ta musique, prépare tes mails de démarchage et suis tes relances.",
    href: "/booking",
    emoji: "🎤",
    color: "#fb923c",
  },
  {
    name: "Drop",
    description: "Ton planning de sortie étape par étape : quoi faire et quand, avec une idée de contenu pour chaque étape.",
    href: "/drop",
    emoji: "🚀",
    color: "#38bdf8",
  },
];
