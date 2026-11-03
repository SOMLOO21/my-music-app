"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as api from "@/booking/api";
import { IMPORT_FIELDS, autoMap, isHelperSheet, isMymusicadsModel, type Mapping } from "@/booking/import/fields";
import { MAX_IMPORT_ROWS, decodeText, parseCsv, toTable, type Table } from "@/booking/import/parse";
import type { ImportReport } from "@/booking/importer";
import { STATUS_LABELS, type OutreachStatus } from "@/booking/types";
import { card, primary, secondary, select } from "./styles";

/** Mention affichée avant validation (cahier des charges, section 3.3). */
export const IMPORT_NOTICE =
  "Les contacts importés restent privés dans ton espace. Ils sont également conservés par l'équipe Mymusicads pour un usage interne. Un contact peut demander à être retiré à tout moment.";

type Sheet = { name: string; table: Table };
type Step = "file" | "mapping" | "preview" | "done";

const GROUPS = [...new Set(IMPORT_FIELDS.map((f) => f.group))];

/** Import en 4 écrans : fichier, colonnes, aperçu + rapport, validation. */
export default function Importer() {
  const [step, setStep] = useState<Step>("file");
  const [filename, setFilename] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sheet = sheets.find((s) => s.name === sheetName) ?? null;
  const table = sheet?.table ?? null;
  const model = table ? isMymusicadsModel(table.headers) : false;

  function chooseSheet(name: string, list = sheets) {
    const t = list.find((s) => s.name === name)?.table;
    setSheetName(name);
    setMapping(t ? autoMap(t.headers) : {});
    setError(t && t.rows.length > MAX_IMPORT_ROWS ? tooMany(t.rows.length) : "");
  }

  async function readFile(file: File) {
    setBusy(true);
    setError("");
    try {
      let list: Sheet[];
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const book = await readXlsxFile(file);
        list = book.map((s) => ({ name: s.sheet, table: toTable(s.data as unknown[][]) })).filter((s) => s.table.rows.length);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        list = [{ name: file.name, table: toTable(parseCsv(decodeText(await file.arrayBuffer()))) }];
      } else {
        throw new Error("Ce format n'est pas pris en charge : choisis un fichier .xlsx ou .csv.");
      }
      list = list.filter((s) => s.table.rows.length);
      if (!list.length) throw new Error("Ce fichier ne contient aucune ligne à importer.");
      setFilename(file.name);
      setSheets(list);
      // Onglet proposé : le premier qui n'est ni une notice ni un tableau de bord
      chooseSheet((list.find((s) => !isHelperSheet(s.name)) ?? list[0]).name, list);
      setStep("mapping");
    } catch (e) {
      setError(e instanceof Error && !/zip|xml|corrupt/i.test(e.message) ? e.message : "Impossible de lire ce fichier. Vérifie qu'il s'ouvre bien dans Excel, puis réessaie.");
    } finally {
      setBusy(false);
    }
  }

  /** Seules les colonnes utilisées partent au serveur. */
  const payload = useMemo((): api.ImportBody | null => {
    if (!table) return null;
    const keep = table.headers.map((h, i) => [h, i] as const).filter(([h]) => mapping[h] && mapping[h] !== "ignore");
    return {
      filename,
      sheet: sheets.length > 1 || /\.xlsx$/i.test(filename) ? sheetName : null,
      headers: keep.map(([h]) => h),
      mapping: Object.fromEntries(keep.map(([h]) => [h, mapping[h]])),
      rows: table.rows.map((r) => keep.map(([, i]) => r[i] ?? "")),
      lines: table.lines,
    };
  }, [table, mapping, filename, sheetName, sheets.length]);

  async function run(action: "preview" | "commit") {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      if (action === "preview") {
        setReport(await api.previewImport(payload));
        setStep("preview");
      } else {
        setReport((await api.commitImport(payload)).report);
        setStep("done");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const steps: [Step, string][] = [
    ["file", "Fichier"],
    ["mapping", "Colonnes"],
    ["preview", "Aperçu"],
    ["done", "Terminé"],
  ];

  return (
    <div>
      <ol className="mb-5 flex gap-1 text-xs">
        {steps.map(([key, text], i) => (
          <li
            key={key}
            className={`flex-1 rounded-full px-2 py-1 text-center ${key === step ? "bg-accent font-semibold text-black" : "bg-white/5 text-white/50"}`}
          >
            {i + 1}. {text}
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      {step === "file" && (
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Importe ton tableau de lieux et de suivi (Excel .xlsx ou .csv). Le fichier est lu sur ton appareil ; tu vérifies tout avant
            que quoi que ce soit soit enregistré.
          </p>
          <label className={`${card} flex cursor-pointer flex-col items-center gap-2 border-dashed py-10 text-center hover:border-white/40`}>
            <span className="text-3xl">📄</span>
            <span className="font-semibold">{busy ? "Lecture du fichier…" : "Choisir un fichier"}</span>
            <span className="text-xs text-white/50">.xlsx ou .csv · {MAX_IMPORT_ROWS.toLocaleString("fr-FR")} lignes maximum</span>
            <input
              type="file"
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {step === "mapping" && table && (
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            <b>{filename}</b> · {table.rows.length} ligne{table.rows.length > 1 ? "s" : ""}
            {model && <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">Modèle Mymusicads reconnu</span>}
          </p>
          {sheets.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50" htmlFor="sheet">
                Onglet à importer
              </label>
              <select id="sheet" className={select} value={sheetName ?? ""} onChange={(e) => chooseSheet(e.target.value)}>
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.table.rows.length} lignes)
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-sm text-white/60">Vérifie à quoi correspond chaque colonne. « Ignorer » : la colonne n&apos;est pas importée.</p>
          <ul className="space-y-2">
            {table.headers.map((h, i) => {
              const examples = table.rows.map((r) => r[i]).filter(Boolean).slice(0, 2);
              return (
                <li key={h} className={`${card} p-3`}>
                  <p className="font-medium">{h}</p>
                  <p className="mb-2 truncate text-xs text-white/40">{examples.join(" · ") || "colonne vide"}</p>
                  <select
                    className={`${select} py-2 text-sm ${mapping[h] === "ignore" ? "text-white/40" : ""}`}
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as Mapping[string] }))}
                    aria-label={`Champ pour la colonne ${h}`}
                  >
                    <option value="ignore">Ignorer</option>
                    {GROUPS.map((g) => (
                      <optgroup key={g} label={g}>
                        {IMPORT_FIELDS.filter((f) => f.group === g).map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={() => setStep("file")}>
              Autre fichier
            </button>
            <button type="button" className={`${primary} flex-1`} disabled={busy || table.rows.length > MAX_IMPORT_ROWS} onClick={() => run("preview")}>
              {busy ? "Analyse…" : "Voir l'aperçu"}
            </button>
          </div>
        </div>
      )}

      {step === "preview" && payload && report && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-base font-semibold">Les 10 premières lignes</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/5 text-white/60">
                  <tr>
                    {payload.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      {r.map((c, j) => (
                        <td key={j} className="max-w-56 truncate px-3 py-2" title={c}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Report report={report} />

          <section className={`${card} space-y-3`}>
            <p className="text-sm text-white/80">{IMPORT_NOTICE}</p>
            <div className="flex gap-2">
              <button type="button" className={secondary} onClick={() => setStep("mapping")} disabled={busy}>
                Modifier
              </button>
              <button type="button" className={`${primary} flex-1`} disabled={busy || !report.rowsValid} onClick={() => run("commit")}>
                {busy ? "Import en cours…" : "Valider l'import"}
              </button>
            </div>
          </section>
        </div>
      )}

      {step === "done" && report && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">Import terminé ✓</p>
          <Report report={report} done />
          <div className="flex flex-wrap gap-2">
            <Link href="/booking/contacts" className={primary}>
              Voir mes contacts
            </Link>
            <Link href="/booking/imports" className={secondary}>
              Historique des imports
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const tooMany = (n: number) =>
  `Cet onglet contient ${n.toLocaleString("fr-FR")} lignes : la limite est de ${MAX_IMPORT_ROWS.toLocaleString("fr-FR")} par import. Découpe ton fichier en plusieurs parties.`;

/** Rapport de rapprochement : lieux reconnus, nouveaux lieux privés, doublons, lignes invalides. */
function Report({ report: r, done = false }: { report: ImportReport; done?: boolean }) {
  const stats: [number, string][] = [
    [r.venuesMatched, "lieu(x) reconnu(s) dans l'annuaire"],
    [r.venuesCreated, "nouveau(x) lieu(x) privé(s)"],
    [r.contactsNew, done ? "contact(s) importé(s)" : "contact(s) à importer"],
    [r.duplicates, "doublon(s) ignoré(s)"],
    [r.outreachNew, "démarche(s) reprise(s) dans ton suivi"],
    [r.rowsTotal - r.rowsValid, "ligne(s) invalide(s)"],
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{done ? "Résultat" : "Rapport"}</h2>
      <ul className="grid grid-cols-2 gap-2">
        {stats.map(([n, text]) => (
          <li key={text} className={`${card} p-3`}>
            <p className="text-2xl font-bold">{n}</p>
            <p className="text-xs text-white/60">{text}</p>
          </li>
        ))}
      </ul>
      {!done && r.sample.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-semibold">Ce qui sera créé (premières lignes)</summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {r.sample.map((s) => (
              <li key={s.line}>
                L.{s.line} · {s.venue ?? "sans lieu"}
                {s.city ? ` (${s.city})` : ""} {s.venue && (s.known ? "· reconnu" : "· nouveau lieu privé")}
                {s.contacts.length > 0 && ` · ${s.contacts.join(", ")}`}
                {s.status && ` · ${STATUS_LABELS[s.status as OutreachStatus]}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.invalid.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-semibold">Lignes invalides ({r.rowsTotal - r.rowsValid})</summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {r.invalid.map((x) => (
              <li key={x.line}>
                Ligne {x.line} : {x.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.invalidEmails.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-semibold text-amber-300">E-mails au format invalide ({r.invalidEmails.length}) : importés à vérifier</summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {r.invalidEmails.map((x, i) => (
              <li key={i}>
                Ligne {x.line} : {x.value}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
