"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { FACETS, PLATFORM_LABEL, emptyTags, type FacetKey, type ResolvedLink, type Tags, type Taxonomy, type Video } from "@/lib/types";
import { TagPicker } from "./Chips";
import Thumb from "./Thumb";

export default function Admin({
  initialVideos,
  initialTaxonomy,
  initialEditId,
}: {
  initialVideos: Video[];
  initialTaxonomy: Taxonomy;
  initialEditId?: string;
}) {
  const [videos, setVideos] = useState(initialVideos);
  const drafts = videos.filter((v) => v.status === "draft");
  const library = videos.filter((v) => v.status === "published");
  const [taxonomy, setTaxonomy] = useState(initialTaxonomy);

  const [link, setLink] = useState("");
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<Tags>(emptyTags);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedBy, setSuggestedBy] = useState<Video["suggestedBy"] | null>(null);
  const editingDraft = videos.find((v) => v.id === editingId)?.status === "draft";

  // Arrivée depuis « Configurer maintenant » (/admin?edit=<id>).
  useEffect(() => {
    const v = initialVideos.find((x) => x.id === initialEditId);
    if (v) startEdit(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setLink("");
    setResolved(null);
    setEditingId(null);
    setTitle("");
    setTags(emptyTags());
    setComment("");
    setSuggestedBy(null);
  }

  /** Pré-remplit les tags (IA, ou règles simples sans clé API). */
  async function suggest(link: ResolvedLink) {
    setSuggesting(true);
    try {
      const r = await api.suggestTags(link);
      setTags(r.tags);
      setSuggestedBy(r.source);
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setSuggesting(false);
    }
  }

  async function analyse(url = link) {
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.resolve(url);
      const existing = videos.find((v) => v.platform === r.platform && v.externalId === r.externalId);
      if (existing) {
        setMessage({ kind: "error", text: "Cette vidéo est déjà dans la bibliothèque : tu peux la modifier ci-dessous." });
        startEdit(existing);
        return;
      }
      setResolved(r);
      setTitle(r.title);
      suggest(r);
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(v: Video) {
    setEditingId(v.id);
    setResolved(v);
    setLink(v.url);
    setTitle(v.title);
    setTags(v.tags);
    setComment(v.comment);
    setSuggestedBy(v.status === "draft" ? (v.suggestedBy ?? null) : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!resolved) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editingId && editingDraft) {
        const updated = await api.updateVideo(editingId, { tags, comment, title, status: "published" });
        setVideos((vs) => vs.map((v) => (v.id === editingId ? updated : v)));
        // On enchaîne directement sur la vidéo suivante à configurer.
        const next = drafts.find((v) => v.id !== editingId);
        if (next) {
          startEdit(next);
          setMessage({ kind: "ok", text: `Publiée ✓ Encore ${drafts.length - 1} à configurer.` });
          return;
        }
        setMessage({ kind: "ok", text: "Publiée ✓ Tout est configuré !" });
      } else if (editingId) {
        const updated = await api.updateVideo(editingId, { tags, comment, title });
        setVideos((vs) => vs.map((v) => (v.id === editingId ? updated : v)));
        setMessage({ kind: "ok", text: "Modifications enregistrées." });
      } else {
        const created = await api.createVideo({ ...resolved, title, tags, comment });
        setVideos((vs) => [created, ...vs]);
        setMessage({ kind: "ok", text: "Vidéo publiée dans le fil ✓" });
      }
      resetForm();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: Video) {
    if (!confirm("Retirer cette vidéo de la bibliothèque ?")) return;
    await api.deleteVideo(v.id);
    setVideos((vs) => vs.filter((x) => x.id !== v.id));
    if (editingId === v.id) resetForm();
  }

  async function addValue(facet: FacetKey, label: string) {
    const next = await api.addTag(facet, label);
    setTaxonomy(next);
    const added = next[facet].find((t) => t.toLowerCase() === label.toLowerCase()) ?? label;
    setTags((t) => (t[facet].includes(added) ? t : { ...t, [facet]: [...t[facet], added] }));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 sm:p-6">
        <h2 className="mb-3 text-base font-semibold">
          {editingDraft ? "Configurer la vidéo reçue" : editingId ? "Modifier l'inspiration" : "Ajouter une inspiration"}
        </h2>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            analyse();
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted && !editingId) setTimeout(() => analyse(pasted), 0);
            }}
            disabled={!!editingId}
            placeholder="Colle un lien TikTok ou Instagram (Reel)"
            className="min-w-0 flex-1 rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-full border border-white/30 px-4 text-sm">
              Annuler
            </button>
          ) : (
            <button disabled={busy || !link.trim()} className="rounded-full bg-accent px-5 text-sm font-semibold text-black disabled:opacity-40">
              {busy && !resolved ? "…" : "Analyser"}
            </button>
          )}
        </form>

        {message && (
          <p className={`mt-3 text-sm ${message.kind === "error" ? "text-red-400" : "text-accent"}`}>{message.text}</p>
        )}

        {resolved && (
          <div className="mt-5 grid gap-6 sm:grid-cols-[240px_1fr]">
            <div className="mx-auto w-full max-w-[240px]">
              <iframe
                src={resolved.embedUrl.replace("autoplay=1", "autoplay=0")}
                title="Aperçu"
                className="aspect-[9/16] w-full rounded-xl bg-black"
                allow="encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
              <p className="mt-2 text-center text-xs text-white/50">
                {PLATFORM_LABEL[resolved.platform]}
                {resolved.author ? ` · @${resolved.author}` : ""}
              </p>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Titre (interne)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex. Hook « devine le refrain » en voiture"
                  className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                <p className="text-xs text-white/60">
                  {suggesting
                    ? "Analyse de la vidéo…"
                    : suggestedBy === "ai"
                      ? "✨ Tags proposés par l'IA : vérifie avant de publier."
                      : suggestedBy === "rules"
                        ? "Tags devinés d'après les hashtags (IA non configurée) : vérifie avant de publier."
                        : "Coche les tags, ou laisse l'IA les proposer."}
                </p>
                <button
                  type="button"
                  onClick={() => resolved && suggest(resolved)}
                  disabled={suggesting}
                  className="rounded-full border border-accent/60 px-3 py-1 text-xs text-accent disabled:opacity-40"
                >
                  {suggesting ? "…" : "✨ Proposer les tags"}
                </button>
              </div>

              <TagPicker taxonomy={taxonomy} value={tags} onChange={setTags} onAdd={addValue} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">
                  Commentaire de l&apos;équipe (visible dans le fil)
                </span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Pourquoi elle est intéressante, comment l'adapter…"
                  className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>

              <button onClick={save} disabled={busy} className="w-full rounded-full bg-accent py-3 font-semibold text-black disabled:opacity-40">
                {editingId && !editingDraft ? "Enregistrer" : "Publier dans le fil"}
              </button>
            </div>
          </div>
        )}
      </section>

      {drafts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-base font-semibold">
            À configurer <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{drafts.length}</span>
          </h2>
          <p className="mb-3 text-sm text-white/50">Vidéos envoyées depuis ton téléphone, pas encore visibles dans le fil.</p>
          <ul className="divide-y divide-white/10">
            {drafts.map((v) => (
              <VideoRow key={v.id} video={v} active={v.id === editingId} onEdit={() => startEdit(v)} onRemove={() => remove(v)} editLabel="Configurer" />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Bibliothèque ({library.length})</h2>
        {library.length === 0 && <p className="text-sm text-white/50">Aucune vidéo pour l&apos;instant.</p>}
        <ul className="divide-y divide-white/10">
          {library.map((v) => (
            <VideoRow key={v.id} video={v} active={v.id === editingId} onEdit={() => startEdit(v)} onRemove={() => remove(v)} editLabel="Modifier" />
          ))}
        </ul>
      </section>
    </div>
  );
}

function VideoRow({
  video: v,
  active,
  onEdit,
  onRemove,
  editLabel,
}: {
  video: Video;
  active: boolean;
  onEdit: () => void;
  onRemove: () => void;
  editLabel: string;
}) {
  return (
    <li className={`flex items-center gap-3 py-3 ${active ? "opacity-50" : ""}`}>
      <div className="h-16 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        <Thumb video={v} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{v.title || v.url}</p>
        <p className="truncate text-xs text-white/50">
          {PLATFORM_LABEL[v.platform]}
          {v.author ? ` · @${v.author}` : ""} · {FACETS.flatMap((f) => v.tags[f.key]).join(", ") || "sans tag"}
        </p>
      </div>
      <button onClick={onEdit} className="rounded-full border border-white/20 px-3 py-1.5 text-xs">
        {editLabel}
      </button>
      <button onClick={onRemove} className="rounded-full border border-red-400/40 px-3 py-1.5 text-xs text-red-300">
        Retirer
      </button>
    </li>
  );
}
