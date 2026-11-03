// Booking : interprétation d'une ligne importée (lieu, contacts, démarche). Fonctions pures.
import { REGIONS, normalizeDepartment, regionOfDepartment } from "../geo";
import { isValidEmail, normalizeEmail, stripAccents } from "../normalize";
import type { OutreachStatus } from "../types";
import type { ImportField } from "./fields";

const fold = (s: string) => stripAccents(s.toLowerCase()).replace(/\s+/g, " ").trim();
const clip = (s: string | null | undefined, max = 300) => {
  const v = (s ?? "").trim();
  return v ? v.slice(0, max) : null;
};

/** Date en AAAA-MM-JJ : ISO, JJ/MM/AAAA, JJ/MM/AA, ou numéro de série Excel. null si illisible. */
export function parseDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    [d, m, y] = [+match[1], +match[2], +match[3]];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
    // Excel compte les jours depuis le 30/12/1899
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000).toISOString().slice(0, 10);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
}

/**
 * Jauge en texte libre : premier nombre qui n'est pas un nombre de concerts, d'artistes…
 * « 240 assis / 150 debout » → 240, « 2 400 à 3 600 » → 2400, « ≈30 concerts, ≈25 000 spectateurs » → 25000.
 */
export function parseCapacity(raw: string | null | undefined): number | null {
  for (const m of (raw ?? "").matchAll(/(\d{1,3}(?:[\s  .]\d{3})+(?!\d)|\d+)\s*([a-zà-ÿ]*)/gi)) {
    if (/^(concerts?|soir[ée]es?|artistes?|groupes?|[ée]ditions?|jours?|ans|dates?|sc[èe]nes?)$/i.test(m[2])) continue;
    const n = Number(m[1].replace(/\D/g, ""));
    if (n > 0 && n <= 300_000) return n;
  }
  return null;
}

/** Montant en centimes : « 300 € », « 1 200,50 ». */
export function parseFee(raw: string | null | undefined): number | null {
  const m = (raw ?? "").replace(/[\s  ]/g, "").match(/\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const n = Math.round(Number(m[0].replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const STATUS_WORDS: [RegExp, OutreachStatus][] = [
  [/sans reponse|pas de reponse|aucune reponse|clos/, "no_reply"],
  [/refus|decline|pas interesse|^non$/, "declined"],
  [/booke|programme|confirme|signe|calee|valide/, "confirmed"],
  [/option/, "hold"],
  [/discussion|en cours|nego|echange|interesse/, "discussing"],
  [/relance ?2|2e relance|deuxieme relance/, "followup_2"],
  [/relance/, "followup_1"],
  [/a contacter|a faire|todo|^$/, "to_contact"],
  [/contacte|envoye|mail envoye|1er contact/, "contacted"],
];

/** Statut du fichier → code de démarche (null si non reconnu). */
export function parseStatus(raw: string | null | undefined): OutreachStatus | null {
  const s = fold(raw ?? "");
  if (!s) return null;
  return STATUS_WORDS.find(([re]) => re.test(s))?.[1] ?? null;
}

const TYPE_WORDS: [RegExp, string][] = [
  [/smac|musiques actuelles/, "SMAC / salle de musiques actuelles"],
  [/jazz|cave/, "Cave / club de jazz"],
  [/festival/, "Festival"],
  [/tremplin|concours|dispositif/, "Tremplin / dispositif"],
  [/peniche|bateau/, "Péniche / lieu atypique"],
  [/tiers|friche/, "Tiers-lieu / friche"],
  [/collectif|organisat/, "Collectif / organisateur de soirées"],
  [/cafe|associati|asso\b/, "Café-culture / associatif"],
  [/\bbars?\b/, "Bar-concert"],
  [/electro|techno|house/, "Club électro"],
  [/salle|theatre|auditorium|opera|spectacle|cabaret/, "Salle de spectacle"],
];

/**
 * Type du fichier → type de l'annuaire si possible, sinon le texte d'origine.
 * « club » seul dépend des esthétiques : club de jazz, club électro, ou laissé tel quel.
 */
export function parseVenueType(raw: string | null | undefined, types: string[], fallback: string | null, genres = ""): string | null {
  const s = fold(raw ?? "");
  if (!s) return fallback;
  const exact = types.find((t) => fold(t) === s);
  if (exact) return exact;
  let word = TYPE_WORDS.find(([re]) => re.test(s))?.[1];
  if (!word && /\bclub\b/.test(s)) {
    const g = fold(genres);
    word = /jazz|swing|blues/.test(g) ? "Cave / club de jazz" : /electro|techno|house/.test(g) ? "Club électro" : undefined;
  }
  return word && types.includes(word) ? word : clip(raw, 60);
}

/** « Jazz, swing / bebop » → esthétiques (libellés de l'annuaire quand ils existent). */
export function parseGenres(raw: string | null | undefined, known: string[]): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,;/|·+]|\bet\b|\n/)) {
    const p = part.trim();
    if (!p || p.length > 40) continue;
    const label = known.find((k) => fold(k) === fold(p)) ?? p.charAt(0).toUpperCase() + p.slice(1);
    if (!out.includes(label)) out.push(label);
  }
  return out.slice(0, 10);
}

/** « Paris 11e », « Lyon (3e) » → la ville sans l'arrondissement. */
export function parseCity(raw: string | null | undefined): string | null {
  const s = clip(raw, 80);
  if (!s) return null;
  const m = s.match(/^(paris|lyon|marseille)\b/i);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : s;
}

export function parseRegion(raw: string | null | undefined, department: string | null): string | null {
  const s = fold(raw ?? "");
  return (s && REGIONS.find((r) => fold(r) === s)) || regionOfDepartment(department);
}

const EMAIL_IN_TEXT = /[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/gi;
const NOT_A_NAME = /\b(non|oui|trouve|formulaire|site|via|page|contact|voir|verifier|inconnu|aucun|n a|na|direction|programmation|general|accueil|equipe|service)\b/;
const PHONE_IN_TEXT = /\+?\d[\d\s.]{7,}\d/g;

/**
 * Texte libre « Jeanne Martin (programmatrice) – prog@lieu.fr » → e-mails, nom et rôle (s'ils en ont l'air).
 * Tout autre texte est gardé en note, tel quel.
 */
export function parseContactText(raw: string | null | undefined) {
  const text = (raw ?? "").trim();
  const emails = text.match(EMAIL_IN_TEXT) ?? [];
  const role = text.match(/\(([^()@]{2,40})\)/)?.[1].trim() ?? null;
  // Nom candidat : ce qui précède la première parenthèse ou le premier tiret
  const head = text
    .replace(EMAIL_IN_TEXT, " ")
    .replace(PHONE_IN_TEXT, " ")
    .split(/[(|;]|\s[–—-]\s/)[0]
    .replace(/[–—:,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+( [A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3}$/.test(head) && !NOT_A_NAME.test(fold(head)) ? head : null;
  // Reste-t-il autre chose que le nom, le rôle, les e-mails et la ponctuation ?
  let rest = text.replace(EMAIL_IN_TEXT, " ");
  if (name) rest = rest.replace(name, " ");
  if (name && role) rest = rest.replace(`(${role})`, " ");
  const leftover = rest.replace(/[\s–—\-:|()[\],;/.]+/g, "");
  return { emails, name, role: name ? role : null, note: leftover ? text : null };
}

/** « Jeanne Martin » → prénom « Jeanne », nom « Martin ». */
export function splitName(full: string | null | undefined) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") || null };
}

export interface RowContact {
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  email: string | null;
  email_normalized: string | null;
  phone: string | null;
  instagram: string | null;
  notes: string | null;
}

export interface RowRecord {
  venue: {
    name: string;
    type: string | null;
    city: string | null;
    department: string | null;
    region: string | null;
    capacity: number | null;
    genres: string[];
    website: string | null;
    instagram: string | null;
    booking_period: string | null;
    usual_format: string | null;
  } | null;
  contacts: RowContact[];
  outreach: {
    status: OutreachStatus;
    first_contact_at: string | null;
    last_action_at: string | null;
    proposed_dates: string | null;
    deal_type: string | null;
    fee_cents: number | null;
    channel: string | null;
  } | null;
  notes: string | null;
  invalidEmails: string[];
  error: string | null;
}

export type RowValues = Partial<Record<ImportField, string>> & { notesList?: string[] };

/** Valeurs d'une ligne (déjà rangées par champ) → lieu, contacts et démarche. */
export function interpretRow(v: RowValues, ctx: { venueTypes: string[]; genres: string[]; defaultType: string | null }): RowRecord {
  const invalidEmails: string[] = [];
  // Une colonne e-mail sans « @ » (« à vérifier (formulaire) ») est une remarque, pas un e-mail invalide
  const asNote = (raw: string | undefined, label: string) => (raw?.trim() && !raw.includes("@") ? `${label} : ${raw.trim()}` : null);
  const emailNotes = [asNote(v.email, "E-mail"), asNote(v.email_general, "E-mail général")].filter((n): n is string => !!n);
  if (emailNotes.length) {
    v = { ...v, email: v.email?.includes("@") ? v.email : undefined, email_general: v.email_general?.includes("@") ? v.email_general : undefined };
  }
  const notes = clip([...emailNotes, ...(v.notesList ?? [])].filter(Boolean).join("\n"), 2000);

  // Lieu
  const name = clip(v.venue_name, 150);
  const department = normalizeDepartment(v.department) ?? normalizeDepartment(v.postal_code);
  const venue = name
    ? {
        name,
        type: parseVenueType(v.venue_type, ctx.venueTypes, ctx.defaultType, v.genres),
        city: parseCity(v.city),
        department,
        region: parseRegion(v.region, department),
        capacity: parseCapacity(v.capacity),
        genres: parseGenres(v.genres, ctx.genres),
        website: clip(v.website, 300),
        instagram: clip(v.venue_instagram, 100),
        booking_period: clip(v.booking_period, 200),
        usual_format: clip(v.usual_format, 100),
      }
    : null;

  // Contacts : le contact de programmation, puis l'e-mail général s'il est différent
  const free = parseContactText(v.contact_text);
  const full = splitName(v.full_name ?? free.name);
  const email = (v.email ?? "").trim() || free.emails[0] || "";
  const checkEmail = (raw: string) => {
    if (!raw) return null;
    const n = normalizeEmail(raw);
    if (isValidEmail(n)) return n;
    invalidEmails.push(raw);
    return null;
  };
  const mainNormalized = checkEmail(email);
  const main: RowContact = {
    first_name: clip(v.first_name, 80) ?? full.first,
    last_name: clip(v.last_name, 80) ?? full.last,
    role: clip(v.role, 80) ?? clip(free.role, 80),
    email: clip(email, 200),
    email_normalized: mainNormalized,
    phone: clip(v.phone, 40),
    instagram: clip(v.instagram, 100),
    notes: free.note ? `Contact : ${free.note}` : null,
  };
  const contacts: RowContact[] = [];
  if (main.first_name || main.last_name || main.email || main.instagram) contacts.push(main);
  const general = (v.email_general ?? "").match(EMAIL_IN_TEXT)?.[0] ?? (v.email_general ?? "").trim();
  const generalNormalized = general ? checkEmail(general) : null;
  if (general && generalNormalized !== mainNormalized) {
    contacts.push({ first_name: null, last_name: null, role: "Contact général", email: clip(general, 200), email_normalized: generalNormalized, phone: null, instagram: null, notes: null });
  }
  // Le téléphone va au premier contact ; seul, il crée un contact « standard »
  if (main.phone && !contacts.includes(main)) {
    if (contacts.length) contacts[0].phone = main.phone;
    else contacts.push({ ...main, role: main.role ?? "Standard" });
  }
  if (notes && contacts.length) contacts[0].notes = [contacts[0].notes, notes].filter(Boolean).join("\n");

  // Démarche, si le fichier contient un suivi
  const firstContact = parseDate(v.first_contact_at);
  const lastAction = parseDate(v.last_action_at);
  const statusRaw = parseStatus(v.status);
  const hasTracking = statusRaw || firstContact || lastAction || v.proposed_dates?.trim() || v.deal_type?.trim() || v.fee?.trim();
  const status: OutreachStatus = statusRaw ?? (firstContact || lastAction ? "contacted" : "to_contact");
  const outreach =
    hasTracking && venue
      ? {
          status,
          first_contact_at: firstContact ?? (status !== "to_contact" ? lastAction : null),
          last_action_at: status === "to_contact" ? null : (lastAction ?? firstContact),
          proposed_dates: clip(v.proposed_dates, 200),
          deal_type: clip(v.deal_type, 80),
          fee_cents: parseFee(v.fee),
          channel: clip(v.channel, 60),
        }
      : null;

  const error = !venue && !contacts.length ? "Ni lieu ni contact sur cette ligne." : null;
  return { venue, contacts, outreach, notes, invalidEmails, error };
}
