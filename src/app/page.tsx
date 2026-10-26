import Link from "next/link";
import { currentUser } from "@/lib/accounts";
import { APPS } from "@/lib/apps";

export const dynamic = "force-dynamic";

/** Accueil My Music App : les apps disponibles. */
export default async function Home() {
  const user = await currentUser();
  return (
    <main className="mx-auto min-h-[100dvh] max-w-3xl px-5 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            My Music <span className="text-accent">App</span>
          </h1>
          <p className="text-sm text-white/50">par Mymusicads</p>
        </div>
        <Link
          href="/compte"
          className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
            user ? "bg-white text-black" : "border border-white/25"
          }`}
          title={user ? `Connecté : @${user.pseudo}` : "Se connecter / créer un compte"}
        >
          {user ? (
            user.firstName.charAt(0).toUpperCase()
          ) : (
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
              <circle cx="8" cy="5" r="3" />
              <path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
            </svg>
          )}
        </Link>
      </header>

      {user && <p className="mb-6 text-lg">Salut {user.firstName} 👋</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {APPS.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="group flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-900 p-5 transition hover:border-white/30"
          >
            <span
              className="flex size-14 items-center justify-center rounded-2xl text-3xl"
              style={{ backgroundColor: app.color }}
              aria-hidden
            >
              {app.emoji}
            </span>
            <span>
              <span className="block text-xl font-semibold">{app.name}</span>
              <span className="mt-1 block text-sm leading-snug text-white/60">{app.description}</span>
            </span>
            <span className="mt-auto text-sm font-semibold text-accent group-hover:underline">Ouvrir →</span>
          </Link>
        ))}
        <div className="flex flex-col justify-center rounded-3xl border border-dashed border-white/15 p-5 text-white/40">
          <span className="text-lg font-semibold">Bientôt</span>
          <span className="mt-1 text-sm">D&apos;autres apps arrivent sur My Music App.</span>
        </div>
      </div>
    </main>
  );
}
