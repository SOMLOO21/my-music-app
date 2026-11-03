"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/booking/api";
import { CAPACITY_RANGES, DEPARTMENTS, REGIONS } from "@/booking/geo";
import type { Venue } from "@/booking/types";
import { card, input, secondary, select } from "./styles";

type Filters = { q: string; type: string; genre: string; ville: string; departement: string; region: string; jauge: string; format: string };
const EMPTY: Filters = { q: "", type: "", genre: "", ville: "", departement: "", region: "", jauge: "", format: "" };

/** Annuaire : recherche, filtres et chargement progressif (lieux partagés + lieux privés de l'artiste). */
export default function Directory({ venueTypes, genres, formats }: { venueTypes: string[]; genres: string[]; formats: string[] }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const active = Object.entries(filters).filter(([k, v]) => k !== "q" && v).length;

  async function load(offset: number, f = filters) {
    setLoading(true);
    setError("");
    try {
      const params = Object.fromEntries(Object.entries({ ...f, offset: String(offset) }).filter(([, v]) => v));
      const r = await api.searchVenues(params);
      setVenues((list) => (offset ? [...list, ...r.venues] : r.venues));
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Recherche relancée à chaque changement de filtre (avec un court délai pendant la saisie)
  useEffect(() => {
    const t = setTimeout(() => load(0), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  const choice = (key: keyof Filters, placeholder: string, options: readonly (string | { value: string; label: string })[]) => (
    <select className={select} value={filters[key]} onChange={set(key)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const { value, label } = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className={input} type="search" placeholder="Nom du lieu ou ville" value={filters.q} onChange={set("q")} />
        <button type="button" onClick={() => setShowFilters((v) => !v)} className={`${secondary} shrink-0`} aria-expanded={showFilters}>
          Filtres{active ? ` (${active})` : ""}
        </button>
      </div>

      {showFilters && (
        <div className={`${card} mb-4 grid gap-2 sm:grid-cols-2`}>
          {choice("type", "Tous les types de lieu", venueTypes)}
          {choice("genre", "Toutes les esthétiques", genres)}
          <input className={input} placeholder="Ville" value={filters.ville} onChange={set("ville")} />
          {choice("departement", "Tous les départements", DEPARTMENTS)}
          {choice("region", "Toutes les régions", REGIONS)}
          {choice("jauge", "Toutes les jauges", CAPACITY_RANGES.map((r) => ({ value: r.key, label: r.label })))}
          {choice("format", "Tous les formats", formats)}
          {active > 0 && (
            <button type="button" onClick={() => setFilters((f) => ({ ...EMPTY, q: f.q }))} className="text-sm text-white/60 underline sm:col-span-2">
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {!loading && venues.length === 0 && !error && (
        <p className={`${card} text-sm text-white/50`}>
          Aucun lieu ne correspond à ta recherche. Essaie d&apos;enlever un filtre, ou ajoute tes propres lieux depuis{" "}
          <Link href="/booking/contacts" className="underline">
            Mes contacts
          </Link>
          .
        </p>
      )}

      <ul className="space-y-2">
        {venues.map((v) => (
          <li key={v.id}>
            <Link href={`/booking/lieux/${v.id}`} className={`${card} block hover:border-white/30`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{v.name}</p>
                {v.owner_user_id && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">privé</span>}
              </div>
              <p className="mt-0.5 text-sm text-white/60">
                {[v.type, v.city, v.capacity ? `${v.capacity} places` : null].filter(Boolean).join(" · ") || "Infos à compléter"}
              </p>
              {v.genres.length > 0 && <p className="mt-1 truncate text-xs text-white/40">{v.genres.join(" · ")}</p>}
            </Link>
          </li>
        ))}
      </ul>

      {loading && <p className="py-4 text-center text-sm text-white/50">Chargement…</p>}
      {more && !loading && (
        <button type="button" onClick={() => load(venues.length)} className={`${secondary} mx-auto mt-4 block`}>
          Voir plus de lieux
        </button>
      )}
    </div>
  );
}
