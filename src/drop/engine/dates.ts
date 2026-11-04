// Drop : calculs de dates sur des jours calendaires « AAAA-MM-JJ », sans heure ni fuseau.
// Les tâches sont datées au jour près : on calcule en UTC pour ne jamais subir les changements d'heure.
const DAY_MS = 86_400_000;

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Vrai si la chaîne est une date « AAAA-MM-JJ » qui existe. */
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;

export const addDays = (iso: string, days: number) => fromUtc(toUtc(iso) + days * DAY_MS);

/** Nombre de jours de « from » à « to » (positif si « to » est après). */
export const diffDays = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** Date du jour à Paris : à calculer côté serveur puis passer au moteur. */
export function todayInParis(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** « J-7 », « J0 », « J+3 ». */
export const jLabel = (offset: number) => (offset === 0 ? "J0" : `J${offset > 0 ? "+" : "-"}${Math.abs(offset)}`);
