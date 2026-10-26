"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFavorites, type FavoriteMap } from "@/lib/favorites";
import { FACETS, PLATFORM_LABEL, emptyTags, type Tags, type Taxonomy, type Video } from "@/lib/types";
import { TagPicker } from "./Chips";
import Thumb from "./Thumb";

const FILTERS_KEY = "diggers.filters";
/** Posé par l'admin : seuls les appareils de l'équipe voient le bouton « + ». */
export const TEAM_KEY = "diggers.team";

type View = "feed" | "grid";

const SOUND_KEY = "diggers.sound";
/** Son des vidéos : activé par défaut, réglable avec le bouton 🔊 (mémorisé sur l'appareil). */
const SoundContext = createContext({ sound: true, toggleSound: () => {} });

function shuffle<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function matches(v: Video, filters: Tags, favoritesOnly: boolean) {
  if (favoritesOnly && !v.favoritedAt) return false;
  // Ou à l'intérieur d'un filtre, Et entre les filtres.
  return FACETS.every((f) => filters[f.key].length === 0 || filters[f.key].some((t) => v.tags[f.key]?.includes(t)));
}

export default function Feed({
  initialVideos,
  draftCount,
  taxonomy,
  user,
  initialFavorites,
  showFavorites,
}: {
  initialVideos: Video[];
  draftCount: number;
  taxonomy: Taxonomy;
  user: { pseudo: string; firstName: string } | null;
  initialFavorites: FavoriteMap;
  showFavorites: boolean;
}) {
  const { videos, toggle, loaded } = useFavorites(initialVideos, { loggedIn: !!user, favorites: initialFavorites });
  const [isTeam, setIsTeam] = useState(false);
  const [toast, setToast] = useState(false);
  const [filters, setFilters] = useState<Tags>(emptyTags);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<View>("feed");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  // Le mélange aléatoire n'a lieu qu'une fois la page affichée côté navigateur
  // (sinon l'ordre différerait entre le serveur et le navigateur).
  const [mounted, setMounted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Préférences lues après l'affichage : le stockage local n'existe pas côté serveur.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "null");
      if (saved) {
        setFilters({ ...emptyTags(), ...saved.filters });
        setFavoritesOnly(!!saved.favoritesOnly);
        if (saved.view === "grid") setView("grid");
      }
      setIsTeam(localStorage.getItem(TEAM_KEY) === "1");
      setSound(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {}
    // Lien « Voir mes favoris » depuis la page compte (/inspire?favoris=1).
    if (showFavorites) setFavoritesOnly(true);
    setMounted(true);
  }, [showFavorites]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleSound() {
    setSound((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? "off" : "on");
      } catch {}
      return !on;
    });
  }

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ filters, favoritesOnly, view }));
    } catch {}
  }, [filters, favoritesOnly, view]);

  // La liste n'est recalculée que quand les filtres changent : retirer un favori
  // ne fait pas disparaître la vidéo qu'on est en train de regarder.
  // Ordre : favoris -> derniers likés d'abord ; filtres -> plus récentes d'abord ;
  // aucun filtre -> mélange aléatoire, renouvelé à chaque retour au fil complet.
  const visibleIds = useMemo(
    () => {
      const list = videos.filter((v) => matches(v, filters, favoritesOnly));
      if (favoritesOnly) list.sort((a, b) => (b.favoritedAt ?? "").localeCompare(a.favoritedAt ?? ""));
      const noFilter = !favoritesOnly && FACETS.every((f) => filters[f.key].length === 0);
      return (noFilter && mounted ? shuffle(list) : list).map((v) => v.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, favoritesOnly, loaded, mounted],
  );
  const byId = new Map(videos.map((v) => [v.id, v]));
  const visible = visibleIds.map((id) => byId.get(id)).filter((v): v is Video => !!v);
  const filterCount = FACETS.reduce((n, f) => n + filters[f.key].length, 0);
  const favoriteCount = videos.filter((v) => v.favoritedAt).length;

  // Nouvelle liste (filtres changés) : on repart de la première vidéo.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
    setOpenIndex(null);
  }, [visibleIds]);

  useEffect(() => {
    const root = scroller.current;
    if (!root || view !== "feed") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [visibleIds, view]);

  function toggleFavorite(v: Video) {
    const added = toggle(v.id);
    // Sans compte, on rappelle que le favori n'est gardé que sur cet appareil.
    if (added && !user) {
      setToast(true);
      setTimeout(() => setToast(false), 5000);
    }
  }

  function resetFilters() {
    setFilters(emptyTags());
    setFavoritesOnly(false);
  }

  function switchView(next: View) {
    setView(next);
    setActive(0);
    setOpenIndex(null);
  }

  const opened = openIndex !== null ? visible[openIndex] : undefined;

  return (
    <SoundContext.Provider value={{ sound, toggleSound }}>
    <main className="relative h-[100dvh] overflow-hidden bg-black">
      <header
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] ${
          view === "feed" ? "bg-gradient-to-b from-black/90 to-transparent pb-6" : "border-b border-white/10 bg-black/90 pb-3 backdrop-blur"
        }`}
      >
        <Link href="/" className="flex items-center gap-1 whitespace-nowrap text-lg font-bold tracking-tight" title="Accueil My Music App">
          <span className="text-white/50" aria-hidden>
            ‹
          </span>
          Inspire
          <span className="hidden text-sm font-normal text-white/40 sm:inline"> · My Music App</span>
        </Link>
        <nav className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
          <div className="flex rounded-full border border-white/25 p-0.5" role="group" aria-label="Affichage">
            <ViewButton current={view} value="feed" label="Défilement" onClick={switchView}>
              <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                <rect x="4" y="1" width="8" height="14" rx="1.5" />
              </svg>
            </ViewButton>
            <ViewButton current={view} value="grid" label="Grille" onClick={switchView}>
              <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                <rect x="1" y="1" width="6" height="8" rx="1" />
                <rect x="9" y="1" width="6" height="5" rx="1" />
                <rect x="1" y="11" width="6" height="4" rx="1" />
                <rect x="9" y="8" width="6" height="7" rx="1" />
              </svg>
            </ViewButton>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filterCount ? "border-accent text-accent" : "border-white/25"}`}
          >
            Filtres{filterCount ? ` · ${filterCount}` : ""}
          </button>
          <button
            onClick={() => setFavoritesOnly((f) => !f)}
            aria-pressed={favoritesOnly}
            className={`rounded-full border px-3 py-1.5 text-sm ${favoritesOnly ? "border-accent bg-accent font-semibold text-black" : "border-white/25"}`}
            title={favoritesOnly ? "Revenir à toutes les vidéos" : "Mes favoris"}
          >
            {favoritesOnly ? "♥" : "♡"} {favoriteCount}
          </button>
          <Link
            href="/compte"
            className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ${
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
          {isTeam && (
            <Link
              href="/admin"
              prefetch={false}
              className="relative rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-black"
              title="Ajouter des vidéos"
            >
              +
              {draftCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] leading-5 text-white"
                  title={`${draftCount} vidéo(s) à configurer`}
                >
                  {draftCount}
                </span>
              )}
            </Link>
          )}
        </nav>
      </header>

      {toast && (
        <Link
          href="/compte"
          className="absolute inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl bg-white px-4 py-3 text-sm text-black shadow-lg"
        >
          ♥ Gardé sur ce téléphone. <span className="font-semibold underline">Crée ton compte</span> pour retrouver tes favoris
          partout.
        </Link>
      )}

      <div
        ref={scroller}
        className={view === "feed" ? "no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll" : "h-full overflow-y-auto pt-16"}
      >
        {view === "feed" &&
          visible.map((v, i) => (
            <Slide key={v.id} video={v} index={i} isActive={i === active} onToggleFavorite={() => toggleFavorite(v)} />
          ))}

        {view === "grid" && visible.length > 0 && (
          <div className="columns-2 gap-3 p-3 sm:columns-3 lg:columns-4 xl:columns-5">
            {visible.map((v, i) => (
              <GridCard key={v.id} video={v} onOpen={() => setOpenIndex(i)} />
            ))}
          </div>
        )}

        {visible.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            {videos.length === 0 ? (
              <>
                <p className="text-xl font-semibold">Aucune inspiration pour l&apos;instant</p>
                <p className="text-white/60">Colle tes premiers liens TikTok ou Instagram dans l&apos;espace admin.</p>
                <Link href="/admin" prefetch={false} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-black">
                  Ajouter des vidéos
                </Link>
              </>
            ) : favoritesOnly && favoriteCount === 0 ? (
              <>
                <p className="text-xl font-semibold">Pas encore de favoris</p>
                <p className="text-white/60">Appuie sur « ♡ Ajouter aux favoris » sous une vidéo pour la retrouver ici.</p>
                <button onClick={() => setFavoritesOnly(false)} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-black">
                  Voir toutes les vidéos
                </button>
              </>
            ) : (
              <>
                <p className="text-xl font-semibold">Aucune vidéo ne correspond</p>
                <button onClick={resetFilters} className="rounded-full border border-white/30 px-5 py-2.5">
                  Réinitialiser les filtres
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {opened && openIndex !== null && (
        <Viewer
          video={opened}
          position={`${openIndex + 1} / ${visible.length}`}
          onClose={() => setOpenIndex(null)}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
          onNext={openIndex < visible.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
          onToggleFavorite={() => toggleFavorite(opened)}
        />
      )}

      {sheetOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/60" onClick={() => setSheetOpen(false)}>
          <div
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-zinc-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filtres</h2>
              <button onClick={resetFilters} className="text-sm text-white/60 hover:text-white">
                Réinitialiser
              </button>
            </div>
            <TagPicker taxonomy={taxonomy} value={filters} onChange={setFilters} />
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
                className="size-4 accent-[#c8ff3d]"
              />
              Seulement mes favoris ♥
            </label>
            <button onClick={() => setSheetOpen(false)} className="mt-5 w-full rounded-full bg-accent py-3 font-semibold text-black">
              Voir {videos.filter((v) => matches(v, filters, favoritesOnly)).length} vidéo(s)
            </button>
          </div>
        </div>
      )}
    </main>
    </SoundContext.Provider>
  );
}

function ViewButton({
  current,
  value,
  label,
  onClick,
  children,
}: {
  current: View;
  value: View;
  label: string;
  onClick: (v: View) => void;
  children: React.ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`rounded-full px-2 py-1 ${selected ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

/** iPhone / iPad (y compris les navigateurs intégrés d'Instagram, TikTok…). */
const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function Player({ video, className }: { video: Video; className: string }) {
  const { sound } = useContext(SoundContext);
  const ref = useRef<HTMLIFrameElement>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const iosRef = useRef(false);
  // iPhone : la vidéo démarre en muet (seule lecture automatique autorisée par Apple) ;
  // un appui n'importe où dessus demande au lecteur d'activer le son.
  const [tapForSound, setTapForSound] = useState(false);
  const [hint, setHint] = useState(false);
  const watchUnmute = useRef<number | null>(null);

  const send = (type: string) =>
    ref.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type }, "https://www.tiktok.com");

  useEffect(() => {
    iosRef.current = isIOS();
    setTapForSound(iosRef.current && video.platform === "tiktok" && soundRef.current);
  }, [video.platform]);

  useEffect(() => {
    if (video.platform !== "tiktok") return;
    const frame = ref.current;
    function onMessage(e: MessageEvent) {
      if (e.source !== frame?.contentWindow) return;
      let data = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data?.["x-tiktok-player"]) return;

      if (data.type === "onPlayerReady") {
        // Ordinateur, Android : lecture automatique avec le son.
        if (soundRef.current && !iosRef.current) send("unMute");
        else send("mute");
        send("play");
      }

      // Après un appui « son » sur iPhone : si l'iPhone a refusé (vidéo remise en muet ou
      // mise en pause), on relance en muet et on renvoie vers l'icône son du lecteur.
      if (watchUnmute.current !== null) {
        const refused = (data.type === "onMute" && data.value === true) || (data.type === "onStateChange" && data.value === 2);
        const accepted = data.type === "onMute" && data.value === false;
        if (refused) {
          window.clearTimeout(watchUnmute.current);
          watchUnmute.current = null;
          send("mute");
          send("play");
          setHint(true);
          window.setTimeout(() => setHint(false), 4000);
        } else if (accepted) {
          window.clearTimeout(watchUnmute.current);
          watchUnmute.current = null;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
     
  }, [video.id, video.platform]);

  useEffect(() => {
    if (video.platform === "tiktok") send(sound ? "unMute" : "mute");
     
  }, [sound, video.platform]);

  function enableSound() {
    setTapForSound(false);
    send("unMute");
    send("play");
    watchUnmute.current = window.setTimeout(() => (watchUnmute.current = null), 2500);
  }

  return (
    <div className={`relative aspect-[9/16] max-w-full ${className}`}>
      <iframe
        ref={ref}
        src={video.embedUrl}
        title={video.title || `Vidéo ${PLATFORM_LABEL[video.platform]}`}
        className="h-full w-full rounded-xl bg-black"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
      />
      {tapForSound && (
        <button
          onClick={enableSound}
          className="absolute inset-0 flex items-end justify-center rounded-xl pb-24"
          aria-label="Activer le son"
        >
          <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
            🔊 Touche pour le son
          </span>
        </button>
      )}
      {hint && (
        <span className="pointer-events-none absolute inset-x-4 bottom-24 rounded-full bg-black/80 px-4 py-2 text-center text-xs text-white">
          Touche l&apos;icône du son en bas de la vidéo
        </span>
      )}
    </div>
  );
}

/** Tags, commentaire de l'équipe et actions, sous la vidéo (défilement et visionneuse). */
function VideoInfo({ video, onToggleFavorite }: { video: Video; onToggleFavorite: () => void }) {
  const { sound, toggleSound } = useContext(SoundContext);
  const tags = FACETS.flatMap((f) => video.tags[f.key] ?? []);
  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {tags.map((t) => (
            <span key={t} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
              {t}
            </span>
          ))}
        </div>
      )}
      {video.comment && <p className="text-sm leading-snug text-white/90">💬 {video.comment}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFavorite}
          aria-pressed={!!video.favoritedAt}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
            video.favoritedAt ? "bg-accent text-black" : "border border-white/30 text-white"
          }`}
        >
          {video.favoritedAt ? "♥ Dans mes favoris" : "♡ Ajouter aux favoris"}
        </button>
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/30 px-4 py-2.5 text-sm text-white/80"
          title={`Ouvrir sur ${PLATFORM_LABEL[video.platform]}`}
        >
          ↗ {PLATFORM_LABEL[video.platform]}
        </a>
        {video.platform === "tiktok" && (
          <button
            onClick={toggleSound}
            aria-pressed={sound}
            className="rounded-full border border-white/30 px-3.5 py-2.5 text-sm"
            title={sound ? "Couper le son" : "Activer le son"}
          >
            {sound ? "🔊" : "🔇"}
          </button>
        )}
      </div>
    </div>
  );
}

function Slide({
  video,
  index,
  isActive,
  onToggleFavorite,
}: {
  video: Video;
  index: number;
  isActive: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <section data-index={index} className="flex h-[100dvh] snap-start snap-always flex-col pt-14">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isActive ? (
          <Player video={video} className="h-full" />
        ) : (
          <div className="flex aspect-[9/16] h-full max-w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
            <Thumb video={video} className="h-full w-full object-cover opacity-60" />
          </div>
        )}
      </div>
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <VideoInfo video={video} onToggleFavorite={onToggleFavorite} />
      </div>
    </section>
  );
}

function GridCard({ video, onOpen }: { video: Video; onOpen: () => void }) {
  const format = video.tags.type[0];
  const others = FACETS.filter((f) => f.key !== "type").flatMap((f) => video.tags[f.key] ?? []);
  return (
    <button onClick={onOpen} className="group mb-3 block w-full break-inside-avoid text-left">
      <div className="relative overflow-hidden rounded-xl bg-zinc-900">
        <Thumb video={video} className="aspect-[9/16] w-full object-cover transition group-hover:scale-[1.03]" />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm">▶ Lire</span>
        </span>
        {video.favoritedAt && (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-black" aria-label="Favori">♥</span>
        )}
      </div>
      <div className="px-0.5 pt-2">
        {format && <p className="text-sm font-semibold leading-tight">{format}</p>}
        {video.author && <p className="truncate text-xs text-white/50">@{video.author}</p>}
        {others.length > 0 && <p className="mt-1 line-clamp-2 text-xs text-white/60">{others.join(" · ")}</p>}
      </div>
    </button>
  );
}

/** Visionneuse ouverte depuis la grille. */
function Viewer({
  video,
  position,
  onClose,
  onPrev,
  onNext,
  onToggleFavorite,
}: {
  video: Video;
  position: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleFavorite: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const nav = "rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-30";

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm text-white/50">{position}</span>
        <button onClick={onClose} className="rounded-full border border-white/25 px-3 py-1.5 text-sm" aria-label="Fermer">
          ✕ Fermer
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <Player key={video.id} video={video} className="h-full" />
      </div>
      <div className="mx-auto w-full max-w-md space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <VideoInfo video={video} onToggleFavorite={onToggleFavorite} />
        <div className="flex justify-between">
          <button onClick={onPrev} disabled={!onPrev} className={nav}>
            ← Précédente
          </button>
          <button onClick={onNext} disabled={!onNext} className={nav}>
            Suivante →
          </button>
        </div>
      </div>
    </div>
  );
}
