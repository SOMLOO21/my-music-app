"use client";
// Favoris :
// - artiste connecté : enregistrés sur son compte (tous ses appareils) ;
// - visiteur sans compte : gardés sur l'appareil (stockage local), puis rattachés
//   au compte à l'inscription ou à la connexion.
import { useCallback, useEffect, useState } from "react";
import type { Video } from "./types";

export const LOCAL_FAVORITES_KEY = "diggers.favorites";

export type FavoriteMap = Record<string, string>;

export function loadLocalFavorites(): FavoriteMap {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) ?? "{}") as FavoriteMap;
  } catch {
    return {};
  }
}

export function clearLocalFavorites() {
  try {
    localStorage.removeItem(LOCAL_FAVORITES_KEY);
  } catch {}
}

/** Ajoute `favoritedAt` aux vidéos et fournit la bascule ♥. */
export function useFavorites(videos: Video[], account: { loggedIn: boolean; favorites: FavoriteMap }) {
  const [favorites, setFavorites] = useState<FavoriteMap>(account.loggedIn ? account.favorites : {});
  const [loaded, setLoaded] = useState(account.loggedIn);

  useEffect(() => {
    if (account.loggedIn) return;
    // Favoris de l'appareil, lus après l'affichage (le stockage local n'existe pas côté serveur).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(loadLocalFavorites());
    setLoaded(true);
  }, [account.loggedIn]);

  const toggle = useCallback(
    (id: string) => {
      // Effets (requête, stockage) hors du setState : React peut rejouer un updater.
      const favorite = !favorites[id];
      const next = { ...favorites };
      if (favorite) next[id] = new Date().toISOString();
      else delete next[id];
      setFavorites(next);

      if (account.loggedIn) {
        fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoId: id, favorite }),
        }).catch(() => {});
      } else {
        try {
          localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(next));
        } catch {}
      }
      return favorite;
    },
    [favorites, account.loggedIn],
  );

  const withFavorites: Video[] = videos.map((v) => ({ ...v, favoritedAt: favorites[v.id] ?? null }));
  return { videos: withFavorites, toggle, loaded };
}
