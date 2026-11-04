"use client";
// Drop : page d'erreur (problème réseau ou serveur) avec un bouton pour réessayer.
import Link from "next/link";
import { useEffect } from "react";

export default function DropError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center" role="alert">
      <p className="text-4xl" aria-hidden>
        😕
      </p>
      <h1 className="mt-3 text-xl font-bold">Oups, Drop n&apos;a pas pu charger cette page</h1>
      <p className="mt-2 text-sm text-white/60">Vérifie ta connexion, puis réessaie. Tes données ne sont pas perdues.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-black">
          Réessayer
        </button>
        <Link href="/drop" className="flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm text-white/80">
          Mes sorties
        </Link>
      </div>
    </main>
  );
}
