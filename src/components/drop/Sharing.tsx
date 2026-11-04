"use client";
// Drop : partage d'une sortie (propriétaire) : lien public en lecture seule et comptes invités.
import { useEffect, useState } from "react";
import {
  createShareLink,
  disableShareLink,
  getShareLink,
  inviteMember,
  listMembers,
  removeMember,
  setMemberRole,
} from "@/drop/api";
import type { Member, MemberRole, ShareLink } from "@/drop/types";
import { card, input, label, primary, secondary } from "./styles";

const ROLE_LABELS: Record<MemberRole, string> = { viewer: "Lecteur", editor: "Éditeur" };
const ROLE_HELP: Record<MemberRole, string> = {
  viewer: "voit tout, ne modifie rien",
  editor: "change statuts, dates et notes, ajoute des tâches",
};

export default function Sharing({ releaseId }: { releaseId: string }) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pseudo, setPseudo] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFoundAccount, setNotFoundAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getShareLink(releaseId), listMembers(releaseId)])
      .then(([l, m]) => {
        if (!alive) return;
        setLink(l.link);
        setMembers(m.members);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [releaseId]);

  const url = link ? `${window.location.origin}/drop/p/${link.token}` : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible : sélectionne le lien et copie-le à la main.");
    }
  };

  const createLink = () => run(async () => setLink((await createShareLink(releaseId)).link));

  return (
    <section className={`${card} space-y-6`} aria-labelledby="sharing-title">
      <h2 id="sharing-title" className="text-lg font-semibold">
        Partage
      </h2>

      {/* Lien public */}
      <div className="space-y-3">
        <h3 className="font-semibold">Lien public en lecture seule</h3>
        <p className="text-sm text-white/60">
          Toute personne qui a le lien voit la feuille de route et le calendrier, sans se connecter. Tes notes et tes liens de fichiers restent privés.
        </p>
        {!loaded ? (
          <p className="text-sm text-white/50">Chargement…</p>
        ) : url ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="share-url">
                Lien public
              </label>
              <input id="share-url" readOnly value={url} className={`${input} text-sm`} onFocus={(e) => e.target.select()} />
              <button type="button" className={primary} onClick={copy}>
                {copied ? "Copié ✓" : "Copier le lien"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirmRegen ? (
                <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmer la régénération">
                  <span className="text-sm text-white/70">L&apos;ancien lien ne marchera plus.</span>
                  <button
                    type="button"
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setConfirmRegen(false);
                      createLink();
                    }}
                  >
                    Oui, nouveau lien
                  </button>
                  <button type="button" className={secondary} onClick={() => setConfirmRegen(false)}>
                    Annuler
                  </button>
                </span>
              ) : (
                <button type="button" className={secondary} disabled={busy} onClick={() => setConfirmRegen(true)}>
                  Régénérer le lien
                </button>
              )}
              <button
                type="button"
                className="min-h-11 rounded-full border border-red-400/40 px-4 text-sm text-red-200 hover:border-red-300"
                disabled={busy}
                onClick={() => run(async () => setLink((await disableShareLink(releaseId)).link))}
              >
                Désactiver le lien
              </button>
            </div>
          </>
        ) : (
          <button type="button" className={primary} disabled={busy} onClick={createLink}>
            Créer un lien de partage
          </button>
        )}
      </div>

      {/* Comptes invités */}
      <div className="space-y-3 border-t border-white/10 pt-5">
        <h3 className="font-semibold">Inviter un compte My Music App</h3>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pseudo.trim()) return;
            setNotFoundAccount(false);
            run(async () => {
              try {
                setMembers((await inviteMember(releaseId, pseudo.trim(), role)).members);
                setPseudo("");
              } catch (err) {
                if ((err as Error).message.startsWith("Aucun compte")) setNotFoundAccount(true);
                throw err;
              }
            });
          }}
        >
          <label className="block flex-1">
            <span className={label}>Pseudo ou e-mail du compte</span>
            <input className={input} value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="off" placeholder="@pseudo" />
          </label>
          <label className="block">
            <span className={label}>Rôle</span>
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="viewer">Lecteur</option>
              <option value="editor">Éditeur</option>
            </select>
          </label>
          <button type="submit" className={primary} disabled={busy || !pseudo.trim()}>
            Inviter
          </button>
        </form>
        <p className="text-xs text-white/50">
          Lecteur : {ROLE_HELP.viewer}. Éditeur : {ROLE_HELP.editor} (utile pour un manager). Supprimer la sortie, changer sa date et gérer
          le partage restent réservés au propriétaire.
        </p>
        {notFoundAccount && (
          <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/80">
            Cette personne n&apos;a pas encore de compte My Music App.{" "}
            {url ? (
              <button type="button" className="font-semibold text-accent underline" onClick={copy}>
                {copied ? "Lien copié ✓" : "Copier le lien public pour le lui envoyer"}
              </button>
            ) : (
              <button type="button" className="font-semibold text-accent underline" onClick={createLink}>
                Créer un lien public à lui envoyer
              </button>
            )}
          </p>
        )}

        {members.length > 0 && (
          <ul className="divide-y divide-white/10">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {m.first_name} {m.last_name}
                  </span>
                  <span className="text-xs text-white/50">@{m.pseudo}</span>
                </span>
                <span className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                    Rôle de {m.pseudo}
                  </label>
                  <select
                    id={`role-${m.user_id}`}
                    value={m.role}
                    disabled={busy}
                    className="min-h-11 rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white"
                    onChange={(e) => run(async () => setMembers((await setMemberRole(releaseId, m.user_id, e.target.value as MemberRole)).members))}
                  >
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                    <option value="editor">{ROLE_LABELS.editor}</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 rounded-full px-3 text-sm text-red-200 hover:text-red-100"
                    onClick={() => run(async () => setMembers((await removeMember(releaseId, m.user_id)).members))}
                    aria-label={`Retirer ${m.pseudo}`}
                  >
                    Retirer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && !notFoundAccount && (
        <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
