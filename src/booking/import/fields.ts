// Booking : champs d'import et correspondance automatique des colonnes (synonymes).
import { stripAccents } from "../normalize";

export const IMPORT_FIELDS = [
  // Lieu
  { key: "venue_name", label: "Nom du lieu", group: "Lieu" },
  { key: "venue_type", label: "Type de lieu", group: "Lieu" },
  { key: "city", label: "Ville", group: "Lieu" },
  { key: "postal_code", label: "Code postal", group: "Lieu" },
  { key: "department", label: "Département", group: "Lieu" },
  { key: "region", label: "Région", group: "Lieu" },
  { key: "capacity", label: "Jauge", group: "Lieu" },
  { key: "genres", label: "Esthétiques", group: "Lieu" },
  { key: "website", label: "Site du lieu", group: "Lieu" },
  { key: "venue_instagram", label: "Instagram du lieu", group: "Lieu" },
  { key: "booking_period", label: "Période de programmation", group: "Lieu" },
  { key: "usual_format", label: "Format habituel", group: "Lieu" },
  // Contact
  { key: "first_name", label: "Prénom", group: "Contact" },
  { key: "last_name", label: "Nom", group: "Contact" },
  { key: "full_name", label: "Prénom et nom", group: "Contact" },
  { key: "role", label: "Rôle", group: "Contact" },
  { key: "email", label: "E-mail (programmation)", group: "Contact" },
  { key: "email_general", label: "E-mail général", group: "Contact" },
  { key: "contact_text", label: "Contact (texte libre : nom, e-mail…)", group: "Contact" },
  { key: "phone", label: "Téléphone", group: "Contact" },
  { key: "instagram", label: "Instagram du contact", group: "Contact" },
  // Démarche
  { key: "status", label: "Statut", group: "Démarche" },
  { key: "first_contact_at", label: "Date du 1er contact", group: "Démarche" },
  { key: "last_action_at", label: "Date de dernière action / relance", group: "Démarche" },
  { key: "proposed_dates", label: "Date(s) proposée(s)", group: "Démarche" },
  { key: "deal_type", label: "Type de deal", group: "Démarche" },
  { key: "fee", label: "Cachet", group: "Démarche" },
  { key: "channel", label: "Canal", group: "Démarche" },
  // Divers
  { key: "notes", label: "Notes (plusieurs colonnes possibles)", group: "Autre" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Correspondance : en-tête de colonne → champ (ou « ignore »). */
export type Mapping = Record<string, ImportField | "ignore">;

export const isImportField = (v: unknown): v is ImportField => IMPORT_FIELDS.some((f) => f.key === v);

/** En-tête normalisé : minuscules, sans accents ni ponctuation. */
export const headerKey = (h: string) =>
  stripAccents(h.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SYNONYMS: Record<ImportField, string[]> = {
  venue_name: ["nom", "lieu", "salle", "nom du lieu", "nom de la salle", "nom lieu", "structure", "etablissement", "venue", "club", "festival", "nom du festival"],
  venue_type: ["type", "type de lieu", "type lieu", "categorie"],
  city: ["ville", "commune", "localite", "arrondissement ville", "city"],
  postal_code: ["code postal", "cp", "zip"],
  department: ["departement", "dept", "dep"],
  region: ["region"],
  capacity: ["jauge", "capacite", "taille", "places", "nombre de places", "capacity"],
  genres: ["styles", "style", "esthetique", "esthetiques", "genre", "genres", "style musical", "styles musicaux"],
  website: ["site", "site web", "site internet", "url", "web", "website"],
  venue_instagram: ["instagram", "insta", "instagram du lieu", "instagram lieu"],
  booking_period: ["periode habituelle", "periode", "bouclage", "periode de programmation", "periode de bouclage"],
  usual_format: ["format", "format habituel", "conditions habituelles"],
  first_name: ["prenom", "prenom contact", "prenom du contact"],
  last_name: ["nom contact", "nom du contact", "nom de famille"],
  full_name: ["interlocuteur", "programmateur", "programmatrice", "responsable", "contact nom", "nom et prenom", "prenom nom"],
  role: ["role", "fonction", "poste"],
  email: ["email", "e mail", "mail", "mail prog", "email prog", "e mail prog", "email booking", "e mail booking", "mail booking", "email programmation", "e mail programmation", "courriel", "adresse mail", "adresse e mail"],
  email_general: ["e mail general", "email general", "mail general", "email contact", "e mail contact", "mail contact"],
  contact_text: ["contact programmation", "contact prog", "contact", "contacts", "contact booking"],
  phone: ["telephone", "tel", "phone", "portable", "mobile", "numero"],
  instagram: ["instagram contact", "instagram du contact"],
  status: ["statut", "statut contact", "statut demarche", "etat", "suivi", "status"],
  first_contact_at: ["date 1er contact", "date premier contact", "date de contact", "date envoi", "date d envoi", "premier contact", "1er contact", "date contact"],
  last_action_at: ["date relance", "derniere relance", "date derniere relance", "derniere action", "date derniere action", "date de relance"],
  proposed_dates: ["dates proposees", "date proposee", "dates proposees", "date du concert", "date concert"],
  deal_type: ["type de deal", "deal", "type de contrat"],
  fee: ["cachet", "montant", "fee", "remuneration"],
  channel: ["canal", "moyen de contact"],
  notes: ["notes", "note", "commentaires", "commentaire", "commentaires suivi", "remarques", "remarque", "detail jam", "jam session", "detail tremplin", "tremplin concours", "organisateur", "lieux", "adresse", "dates 2026"],
};

/** Proposition automatique : chaque champ ne sert qu'une fois (sauf les notes). */
export function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<ImportField>();
  for (const h of headers) {
    const key = headerKey(h);
    const field = (Object.keys(SYNONYMS) as ImportField[]).find((f) => (f === "notes" || !used.has(f)) && SYNONYMS[f].includes(key));
    mapping[h] = field ?? "ignore";
    if (field) used.add(field);
  }
  return mapping;
}

/** Fichier de suivi Mymusicads (onglets « Salles Paris », « Festivals France »…) reconnu à ses colonnes. */
export function isMymusicadsModel(headers: string[]) {
  const keys = new Set(headers.map(headerKey));
  return keys.has("contact prog trouve") || (keys.has("contact programmation") && keys.has("e mail general") && keys.has("statut contact"));
}

/** Onglets à ne pas proposer en premier (notice, tableau de bord, listes de valeurs). */
export const isHelperSheet = (name: string) => /lisez|lis moi|readme|tableau de bord|dashboard|listes?$|parametres/i.test(stripAccents(name));
