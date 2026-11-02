// Booking : normalisation des emails, slugs et clés de rapprochement des lieux.
import type { EmailKind, MasterInput } from "./types";

/** Minuscules, sans espaces ni « mailto: » ; null si vide. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/^mailto:/i, "")
    .replace(/^<|>$/g, "")
    .toLowerCase();
  return email || null;
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

/** Format valide (après normalisation). */
export const isValidEmail = (email: string | null | undefined) => !!email && EMAIL_RE.test(email) && !email.includes("..");

/** Adresses de service : booking@, contact@, prog@, info@… (aussi « prog.jazz@ », « booking2@ »). */
const GENERIC_LOCAL = [
  "booking", "bookings", "contact", "contacts", "prog", "programmation", "programmateur", "programming",
  "info", "infos", "information", "hello", "bonjour", "salut", "accueil", "admin", "administration",
  "communication", "com", "presse", "press", "production", "prod", "management", "direction", "secretariat",
  "billetterie", "reservation", "reservations", "resa", "mail", "office", "team", "equipe", "artistes",
  "artists", "live", "concert", "concerts", "events", "event", "evenements", "asso", "association",
  "festival", "music", "musique", "label", "noreply", "no-reply",
];
const GENERIC_RE = new RegExp(`^(${GENERIC_LOCAL.map((w) => w.replace(/-/g, "\\-")).join("|")})(\\d*|[._+-].*)$`);

export function emailKind(email: string): EmailKind {
  return GENERIC_RE.test(email.split("@")[0]) ? "generic" : "personal";
}

export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function slugify(s: string) {
  return stripAccents(s.toLowerCase())
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const ARTICLES = new Set(["le", "la", "les", "l"]);

/** Mots significatifs : sans accents, sans ponctuation, sans « le / la / les / l’ ». */
function keyWords(s: string | null | undefined) {
  return stripAccents(String(s ?? "").toLowerCase())
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !ARTICLES.has(w))
    .join(" ");
}

/** Clé de rapprochement d'un lieu : « nom|ville » normalisés (« Le Ferrailleur », « Nantes » → « ferrailleur|nantes »). */
export const venueMatchKey = (name: string, city: string | null | undefined) => `${keyWords(name)}|${keyWords(city)}`;

export const normalizePhone = (phone: string | null | undefined) => {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
};

/** Pseudo Instagram sans @ ni URL. */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = (m ? m[1] : s).replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

/**
 * Clé de dédoublonnage de la base maître : l'email normalisé s'il est valide ;
 * sinon lieu + nom + téléphone / Instagram. null si le contact n'a rien d'identifiable.
 */
export function masterDedupeKey(c: MasterInput): string | null {
  const email = normalizeEmail(c.email);
  if (isValidEmail(email)) return email;
  const reach = normalizePhone(c.phone) ?? normalizeInstagram(c.instagram);
  if (!reach) return null;
  const venue = c.venue_name ? venueMatchKey(c.venue_name, c.city) : "";
  return `nomail:${venue}:${keyWords(`${c.first_name ?? ""} ${c.last_name ?? ""}`)}:${reach}`;
}
