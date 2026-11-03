// Booking : régions, départements et tranches de jauge (listes fixes, utilisables côté navigateur).

const REGION_DEPARTMENTS: Record<string, string[]> = {
  "Auvergne-Rhône-Alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "Bourgogne-Franche-Comté": ["21", "25", "39", "58", "70", "71", "89", "90"],
  Bretagne: ["22", "29", "35", "56"],
  "Centre-Val de Loire": ["18", "28", "36", "37", "41", "45"],
  Corse: ["2A", "2B"],
  "Grand Est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "Hauts-de-France": ["02", "59", "60", "62", "80"],
  "Île-de-France": ["75", "77", "78", "91", "92", "93", "94", "95"],
  Normandie: ["14", "27", "50", "61", "76"],
  "Nouvelle-Aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  Occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "Pays de la Loire": ["44", "49", "53", "72", "85"],
  "Provence-Alpes-Côte d'Azur": ["04", "05", "06", "13", "83", "84"],
  Guadeloupe: ["971"],
  Martinique: ["972"],
  Guyane: ["973"],
  "La Réunion": ["974"],
  Mayotte: ["976"],
};

export const REGIONS = Object.keys(REGION_DEPARTMENTS);
export const DEPARTMENTS = Object.values(REGION_DEPARTMENTS).flat().sort();

/** « 44 », « 2a », « 75000 » (code postal) → code département, ou null. */
export function normalizeDepartment(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) return s.startsWith("97") ? s.slice(0, 3) : s.startsWith("20") ? null : s.slice(0, 2);
  const code = /^\d$/.test(s) ? `0${s}` : s;
  return DEPARTMENTS.includes(code) ? code : null;
}

export function regionOfDepartment(code: string | null | undefined): string | null {
  const dep = normalizeDepartment(code);
  if (!dep) return null;
  return REGIONS.find((r) => REGION_DEPARTMENTS[r].includes(dep)) ?? null;
}

export const CAPACITY_RANGES = [
  { key: "xs", label: "Moins de 100", min: undefined, max: 99 },
  { key: "s", label: "100 à 300", min: 100, max: 300 },
  { key: "m", label: "300 à 600", min: 301, max: 600 },
  { key: "l", label: "600 à 1 200", min: 601, max: 1200 },
  { key: "xl", label: "Plus de 1 200", min: 1201, max: undefined },
] as const;

export const capacityRange = (key: string | null | undefined) => CAPACITY_RANGES.find((r) => r.key === key);
