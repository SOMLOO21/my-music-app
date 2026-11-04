import Link from "next/link";

export default function ReleaseNotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl" aria-hidden>
        🔎
      </p>
      <h1 className="mt-3 text-xl font-bold">Sortie introuvable</h1>
      <p className="mt-2 text-sm text-white/60">Elle a peut-être été supprimée, ou tu n&apos;y as pas accès avec ce compte.</p>
      <Link href="/drop" className="mt-6 flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-black">
        Mes sorties
      </Link>
    </main>
  );
}
