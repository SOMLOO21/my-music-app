// Booking : lecture des fichiers importés (CSV ici ; XLSX via read-excel-file dans le navigateur).
// Fonctions pures, utilisables dans le navigateur, sur le serveur et dans les tests.

export const MAX_IMPORT_ROWS = 5000;

/** Un tableau prêt pour la correspondance des colonnes. `lines` : numéro de ligne dans le fichier. */
export interface Table {
  headers: string[];
  rows: string[][];
  lines: number[];
}

/** Texte d'un fichier : UTF-8 si valide, sinon Windows-1252 (exports Excel français). */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
}

/** Séparateur le plus fréquent sur la première ligne (hors guillemets) : « ; », « , » ou tabulation. */
function detectSeparator(text: string) {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ";";
}

/** CSV avec guillemets, retours à la ligne dans les cellules et « "" » échappés. */
export function parseCsv(text: string): string[][] {
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Valeur de cellule → texte (dates en AAAA-MM-JJ, nombres sans format). */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, " ").trim();
}

/**
 * Tableau brut → en-têtes + lignes : la première ligne non vide sert d'en-têtes,
 * les lignes vides sont ignorées, les colonnes sans titre ni valeur aussi.
 */
export function toTable(raw: unknown[][]): Table {
  const text = raw.map((r) => r.map(cellText));
  const first = text.findIndex((r) => r.some(Boolean));
  if (first < 0) return { headers: [], rows: [], lines: [] };
  const width = Math.max(...text.map((r) => r.length));
  const body = text.slice(first + 1);
  const keep = [...Array(width).keys()].filter((i) => text[first][i] || body.some((r) => r[i]));
  const seen = new Map<string, number>();
  const headers = keep.map((i) => {
    const h = text[first][i] || `Colonne ${i + 1}`;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n > 1 ? `${h} (${n})` : h;
  });
  const rows: string[][] = [];
  const lines: number[] = [];
  body.forEach((r, i) => {
    if (!r.some(Boolean)) return;
    rows.push(keep.map((c) => r[c] ?? ""));
    lines.push(first + i + 2);
  });
  return { headers, rows, lines };
}
