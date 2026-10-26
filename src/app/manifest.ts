import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Music App",
    short_name: "My Music App",
    description: "Les apps de Mymusicads pour les artistes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    // Android : l'app installée apparaît dans le menu « Partager » de TikTok / Instagram.
    // (iOS ne gère pas share_target : on passe par un Raccourci.)
    ...({
      share_target: {
        action: "/partager",
        method: "GET",
        params: { title: "title", text: "text", url: "url" },
      },
    } as Partial<MetadataRoute.Manifest>),
  };
}
