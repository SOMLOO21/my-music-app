"use client";

import Link from "next/link";
import { useState } from "react";
import { clearLocalFavorites, loadLocalFavorites } from "@/lib/favorites";

type User = { pseudo: string; firstName: string; lastName: string };

const input =
  "w-full rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-base outline-none focus:border-accent";

export default function Account({ user, favoriteCount }: { user: User | null; favoriteCount: number }) {
  if (user) return <Profile user={user} favoriteCount={favoriteCount} />;
  return <AuthForms />;
}

function Profile({ user, favoriteCount }: { user: User; favoriteCount: number }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/account/logout", { method: "POST" });
    // Rechargement complet : les pages serveur relisent le cookie de session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-10 text-center">
      <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-white text-3xl font-bold text-black">
        {user.firstName.charAt(0).toUpperCase()}
      </div>
      <div>
        <p className="text-xl font-semibold">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-white/60">@{user.pseudo}</p>
      </div>
      <Link href="/inspire?favoris=1" className="block rounded-full bg-accent py-3 font-semibold text-black">
        ♥ Mes favoris ({favoriteCount})
      </Link>
      <p className="text-sm text-white/50">
        Tu restes connecté sur cet appareil. Sur un autre téléphone ou ordinateur, connecte-toi avec ton pseudo et ton mot de
        passe pour retrouver tes favoris.
      </p>
      <button onClick={logout} disabled={busy} className="text-sm text-white/60 underline hover:text-white">
        Se déconnecter
      </button>
    </div>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [form, setForm] = useState({ firstName: "", lastName: "", pseudo: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body =
      mode === "signup" ? form : { pseudo: form.pseudo, password: form.password };
    // Les favoris ajoutés sans compte sur cet appareil rejoignent le compte.
    const res = await fetch(`/api/account/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, favorites: loadLocalFavorites() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
      setBusy(false);
      return;
    }
    clearLocalFavorites();
    // Rechargement complet : les pages serveur relisent le cookie de session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  const tab = (value: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError("");
      }}
      className={`flex-1 rounded-full py-2 text-sm font-semibold ${mode === value ? "bg-white text-black" : "text-white/70"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <p className="mb-6 text-center text-white/70">
        Crée ton compte pour retrouver tes vidéos favorites sur ton téléphone et ton ordinateur.
      </p>
      <div className="mb-6 flex rounded-full border border-white/20 p-1">
        {tab("signup", "Créer mon compte")}
        {tab("login", "Me connecter")}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <div className="flex gap-3">
            <input className={input} placeholder="Prénom" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} required />
            <input className={input} placeholder="Nom" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} required />
          </div>
        )}
        <input
          className={input}
          placeholder="Pseudo (ex. nom d'artiste)"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={form.pseudo}
          onChange={set("pseudo")}
          required
        />
        <input
          className={input}
          type="password"
          placeholder={mode === "signup" ? "Mot de passe (6 caractères minimum)" : "Mot de passe"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={form.password}
          onChange={set("password")}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="w-full rounded-full bg-accent py-3 font-semibold text-black disabled:opacity-50">
          {busy ? "…" : mode === "signup" ? "Créer mon compte" : "Me connecter"}
        </button>
      </form>

      {mode === "login" && (
        <p className="mt-4 text-center text-xs text-white/50">
          Mot de passe oublié ? Demande à l&apos;équipe Mymusicads de le réinitialiser.
        </p>
      )}
    </div>
  );
}
