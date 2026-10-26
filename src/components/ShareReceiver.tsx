"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sendToInbox } from "@/lib/api";
import Thumb from "./Thumb";
import type { Video } from "@/lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; duplicate: boolean; video: Video };

export default function ShareReceiver({ shared }: { shared: { url?: string; text?: string; title?: string } }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    sendToInbox(shared)
      .then((r) => setState({ kind: "done", duplicate: r.result === "duplicate", video: r.video }))
      .catch((e) => setState({ kind: "error", message: (e as Error).message }));
  }, [shared]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-lg font-bold tracking-tight">
        My Music <span className="text-accent">App</span>
      </span>

      {state.kind === "loading" && <p className="text-white/70">Ajout de la vidéo…</p>}

      {state.kind === "error" && (
        <>
          <p className="text-red-400">{state.message}</p>
          <Link href="/admin" className="rounded-full border border-white/30 px-5 py-2.5">
            Ouvrir l&apos;admin
          </Link>
        </>
      )}

      {state.kind === "done" && (
        <>
          <Thumb video={state.video} className="h-48 w-28 rounded-xl object-cover" />
          <p className="text-xl font-semibold">
            {state.duplicate
              ? state.video.status === "draft"
                ? "Déjà dans « À configurer »"
                : "Déjà dans la bibliothèque"
              : "Ajoutée à « À configurer » ✓"}
          </p>
          {state.video.author && <p className="text-sm text-white/60">@{state.video.author}</p>}
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Link href={`/admin?edit=${state.video.id}`} className="rounded-full bg-accent py-3 font-semibold text-black">
              Configurer maintenant
            </Link>
            <p className="text-sm text-white/50">ou retourne sur TikTok et continue à envoyer des vidéos.</p>
          </div>
        </>
      )}
    </main>
  );
}
