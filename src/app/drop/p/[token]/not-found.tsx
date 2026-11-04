export default function PublicNotFound() {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl" aria-hidden>
        🔒
      </p>
      <h1 className="mt-3 text-xl font-bold">Ce lien ne fonctionne plus</h1>
      <p className="mt-2 text-sm text-white/60">Le planning n&apos;existe pas ou son lien de partage a été désactivé. Demande un nouveau lien à l&apos;artiste.</p>
    </main>
  );
}
