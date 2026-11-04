"use client";
// Drop : l'assistant ne s'affiche que dans le navigateur (il reprend le brouillon gardé dans sessionStorage).
import dynamic from "next/dynamic";

const Wizard = dynamic(() => import("./Wizard"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-sm text-white/50">Chargement…</p>,
});

export default function WizardLoader({ defaultArtist }: { defaultArtist: string }) {
  return <Wizard defaultArtist={defaultArtist} />;
}
