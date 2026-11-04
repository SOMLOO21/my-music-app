"use client";
// Drop : tableau admin de toutes les sorties (recherche, filtres, tri, export CSV du tableau affiché).
import Link from "next/link";
import { useMemo, useState } from "react";
import { DROP_CONFIG } from "@/drop/config/index";
import type { AdminReleaseRow } from "@/drop/admin-repo";
import { MODE_LABELS, TYPE_LABELS, countdownLabel, frShortDate } from "@/drop/labels";
import { input, secondary } from "./styles";

type SortKey = "owner_pseudo" | "artist_name" | "title" | "type" | "release_date" | "mode" | "progress" | "late" | "updated_at";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "owner_pseudo", label: "Compte" },
  { key: "artist_name", label: "Artiste" },
  { key: "title", label: "Titre" },
  { key: "type", label: "Type" },
  { key: "release_date", label: "Sortie" },
  { key: "mode", label: "Mode" },
  { key: "progress", label: "Progression" },
  { key: "late", label: "En retard" },
  { key: "updated_at", label: "Dernière activité" },
];

const progressOf = (r: AdminReleaseRow) => (r.total ? Math.round((r.done / r.total) * 100) : 0);
const activity = (iso: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const selectClass = "min-h-11 rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white";

/** Une cellule CSV : guillemets doublés, et neutralisation des formules (=, +, -, @) pour Excel. */
const csvCell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function AdminTable({ rows, today }: { rows: AdminReleaseRow[]; today: string }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [mode, setMode] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated_at", dir: -1 });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!needle || [r.owner_pseudo, r.artist_name, r.title].some((v) => v.toLowerCase().includes(needle))) &&
        (!type || r.type === type) &&
        (!mode || r.mode === mode) &&
        (!lateOnly || r.late > 0) &&
        (!from || r.release_date >= from) &&
        (!to || r.release_date <= to),
    );
    const value = (r: AdminReleaseRow) => (sort.key === "progress" ? progressOf(r) : r[sort.key]);
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr")) * sort.dir;
    });
  }, [rows, q, type, mode, lateOnly, from, to, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  function exportCsv() {
    const header = ["Compte", "Artiste", "Titre", "Type", "Date de sortie", "Mode", "Progression (%)", "Étapes faites", "Étapes", "En retard", "Dernière activité"];
    const lines = shown.map((r) =>
      [r.owner_pseudo, r.artist_name, r.title, TYPE_LABELS[r.type as keyof typeof TYPE_LABELS] ?? r.type, r.release_date, MODE_LABELS[r.mode as keyof typeof MODE_LABELS] ?? r.mode, progressOf(r), r.done, r.total, r.late, r.updated_at]
        .map(csvCell)
        .join(";"),
    );
    // BOM + « ; » : ouverture directe dans Excel en français.
    const blob = new Blob([`﻿${[header.join(";"), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `drop-sorties-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Rechercher</span>
          <input className={input} placeholder="Rechercher un compte, un artiste, un titre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="Type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Tous modes</option>
          {DROP_CONFIG.settings.modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-white/60">
          Sortie du
          <input type="date" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-white/60">
          au
          <input type="date" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          type="button"
          aria-pressed={lateOnly}
          onClick={() => setLateOnly(!lateOnly)}
          className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${lateOnly ? "border-red-300 bg-red-400/15 text-red-200" : "border-white/20 text-white/70"}`}
        >
          En retard
        </button>
        <button type="button" className={secondary} onClick={exportCsv} disabled={shown.length === 0}>
          Exporter en CSV
        </button>
      </div>

      <p className="mb-2 text-sm text-white/50">
        {shown.length} sortie{shown.length > 1 ? "s" : ""} sur {rows.length}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-white/50">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(c.key)} className="flex min-h-9 items-center gap-1 font-semibold hover:text-white">
                    {c.label}
                    <span aria-hidden>{sort.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {shown.map((r) => {
              const pct = progressOf(r);
              return (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 text-white/70">@{r.owner_pseudo}</td>
                  <td className="px-3 py-2">{r.artist_name}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/drop/${r.id}`} className="font-medium text-accent hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{TYPE_LABELS[r.type as keyof typeof TYPE_LABELS] ?? r.type}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {frShortDate(r.release_date)} <span className="text-white/50">{countdownLabel(r.release_date, today)}</span>
                  </td>
                  <td className="px-3 py-2">{MODE_LABELS[r.mode as keyof typeof MODE_LABELS] ?? r.mode}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10" aria-hidden>
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-white/70">{pct} %</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 ${r.late ? "font-semibold text-red-300" : "text-white/50"}`}>{r.late}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-white/60">{activity(r.updated_at)}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-white/50">
                  Aucune sortie ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
