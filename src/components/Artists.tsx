"use client";

import { useEffect, useState } from "react";
import { TEAM_KEY } from "./Feed";

type Artist = { id: string; pseudo: string; first_name: string; last_name: string; created_at: string; favorites: number };

/** Admin : artistes inscrits et réinitialisation de mot de passe. */
export default function Artists() {
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Cet appareil a ouvert l'admin : on y affiche le bouton « + » dans le fil.
    try {
      localStorage.setItem(TEAM_KEY, "1");
    } catch {}
    fetch("/api/users")
      .then((r) => r.json() as Promise<Artist[]>)
      .then(setArtists)
      .catch(() => setArtists([]));
  }, []);

  async function reset(a: Artist) {
    const password = prompt(`Nouveau mot de passe pour @${a.pseudo} (6 caractères minimum) :`);
    if (!password) return;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: a.id, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(res.ok ? `Mot de passe de @${a.pseudo} réinitialisé : transmets-le-lui.` : (data.error ?? "Erreur."));
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pb-12">
      <h2 className="mb-3 text-base font-semibold">Artistes inscrits ({artists?.length ?? "…"})</h2>
      {message && <p className="mb-3 text-sm text-accent">{message}</p>}
      {artists?.length === 0 && <p className="text-sm text-white/50">Aucun artiste inscrit pour l&apos;instant.</p>}
      <ul className="divide-y divide-white/10">
        {artists?.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
              {a.first_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {a.first_name} {a.last_name} <span className="text-white/50">@{a.pseudo}</span>
              </p>
              <p className="text-xs text-white/50">
                Inscrit le {new Date(a.created_at).toLocaleDateString("fr-FR")} · {a.favorites} favori(s)
              </p>
            </div>
            <button onClick={() => reset(a)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs">
              Nouveau mot de passe
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
