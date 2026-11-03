// Booking : import d'un fichier par un artiste. Même calcul pour l'aperçu (rapport) et la validation,
// qui enregistre tout d'un bloc (sql.batch) : import, lieux privés, contacts, démarches, copie dans la base maître.
import type { PublicUser } from "@/lib/accounts";
import { sql } from "@/lib/sql";
import { copyToMasterStatements } from "./admin-repo";
import { isImportField, type ImportField, type Mapping } from "./import/fields";
import { MAX_IMPORT_ROWS } from "./import/parse";
import { interpretRow, type RowContact, type RowValues } from "./import/rows";
import { slugify, stripAccents, venueMatchKey } from "./normalize";
import { getImportContext, importStatements } from "./repo";
import { flatGenres, getBookingTaxonomy } from "./taxonomy";
import type { MasterInput, Venue } from "./types";

export interface ImportPayload {
  filename: string;
  sheet: string | null;
  headers: string[];
  mapping: Mapping;
  rows: string[][];
  lines: number[];
}

export interface ImportReport {
  rowsTotal: number;
  rowsValid: number;
  invalid: { line: number; reason: string }[];
  invalidEmails: { line: number; value: string }[];
  venuesMatched: number;
  venuesCreated: number;
  contactsNew: number;
  duplicates: number;
  outreachNew: number;
  /** Aperçu de ce qui sera créé pour les premières lignes. */
  sample: { line: number; venue: string | null; city: string | null; known: boolean; contacts: string[]; status: string | null }[];
}

export class ImportError extends Error {}

/** Vérifie et nettoie ce qu'envoie le navigateur (aucun identifiant d'artiste n'y est lu). */
export function readPayload(b: Record<string, unknown>): ImportPayload {
  const headers = Array.isArray(b.headers) ? b.headers.map((h) => String(h).slice(0, 200)) : [];
  const rows = Array.isArray(b.rows) ? (b.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((c) => String(c ?? "").slice(0, 5000))) : [];
  if (!headers.length || !rows.length) throw new ImportError("Le fichier ne contient aucune ligne à importer.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportError(`Ton fichier contient ${rows.length} lignes : la limite est de ${MAX_IMPORT_ROWS} par import. Découpe-le en plusieurs fichiers.`);
  }
  const mapping: Mapping = {};
  const raw = (b.mapping ?? {}) as Record<string, unknown>;
  for (const h of headers) mapping[h] = isImportField(raw[h]) ? (raw[h] as ImportField) : "ignore";
  if (!Object.values(mapping).some((f) => f === "venue_name" || f === "email" || f === "contact_text" || f === "email_general")) {
    throw new ImportError("Indique au moins la colonne du nom du lieu ou celle de l'e-mail.");
  }
  const lines = Array.isArray(b.lines) ? b.lines.map(Number) : [];
  return {
    filename: String(b.filename ?? "fichier").slice(0, 200),
    sheet: b.sheet ? String(b.sheet).slice(0, 100) : null,
    headers,
    mapping,
    rows,
    lines: rows.map((_, i) => (Number.isFinite(lines[i]) ? lines[i] : i + 2)),
  };
}

const fold = (s: string | null | undefined) => stripAccents((s ?? "").toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
const newId = () => crypto.randomUUID().replace(/-/g, "");
/** Contact sans e-mail : doublon s'il a le même lieu, le même nom et le même téléphone / Instagram. */
const noEmailKey = (venueId: string | null, c: Pick<RowContact, "first_name" | "last_name" | "phone" | "instagram">) =>
  `${venueId ?? ""}|${fold(`${c.first_name ?? ""} ${c.last_name ?? ""}`)}|${(c.phone ?? "").replace(/\D/g, "")}|${fold(c.instagram)}`;

/** Calcule tout l'import sans rien écrire. */
async function plan(userId: string, p: ImportPayload) {
  const [ctx, taxonomy] = await Promise.all([getImportContext(userId), getBookingTaxonomy()]);
  const sheet = fold(p.sheet);
  const defaultType = /festival/.test(sheet) ? "Festival" : /tremplin/.test(sheet) ? "Tremplin / dispositif" : null;
  const interpretCtx = { venueTypes: taxonomy.venue_type, genres: flatGenres(taxonomy), defaultType };

  // Lieux connus : l'annuaire partagé d'abord, puis les lieux privés de l'artiste
  const byKey = new Map<string, Venue>();
  for (const v of ctx.venues) if (!byKey.has(v.match_key)) byKey.set(v.match_key, v);
  const emails = new Set(ctx.contacts.map((c) => c.email_normalized).filter(Boolean));
  const noEmail = new Set(ctx.contacts.filter((c) => !c.email_normalized).map((c) => noEmailKey(c.venue_id, c)));

  const report: ImportReport = { rowsTotal: p.rows.length, rowsValid: 0, invalid: [], invalidEmails: [], venuesMatched: 0, venuesCreated: 0, contactsNew: 0, duplicates: 0, outreachNew: 0, sample: [] };
  const newVenues = new Map<string, Record<string, unknown>>();
  const matched = new Set<string>();
  const venues: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];
  const outreach: Record<string, unknown>[] = [];
  const outreachVenues = new Set(ctx.outreachVenueIds);
  const master: MasterInput[] = [];

  p.rows.forEach((cells, index) => {
    const line = p.lines[index];
    const values: RowValues = { notesList: [] };
    p.headers.forEach((h, i) => {
      const field = p.mapping[h];
      const value = (cells[i] ?? "").trim();
      if (!value || field === "ignore") return;
      if (field === "notes") values.notesList!.push(`${h} : ${value}`);
      else values[field] ??= value;
    });
    const rec = interpretRow(values, interpretCtx);
    for (const value of rec.invalidEmails) report.invalidEmails.push({ line, value });
    if (rec.error) {
      report.invalid.push({ line, reason: rec.error });
      return;
    }
    report.rowsValid++;

    // Lieu : reconnu (nom + ville) ou nouveau lieu privé
    let venueId: string | null = null;
    let venueInfo: Partial<Venue> | null = null;
    let known = false;
    if (rec.venue) {
      const key = venueMatchKey(rec.venue.name, rec.venue.city);
      const existing = byKey.get(key);
      if (existing) {
        known = true;
        venueId = existing.id;
        venueInfo = existing;
        if (!matched.has(existing.id)) {
          matched.add(existing.id);
          report.venuesMatched++;
        }
      } else {
        let created = newVenues.get(key);
        if (!created) {
          created = {
            id: newId(),
            ...rec.venue,
            genres: JSON.stringify(rec.venue.genres),
            slug: slugify(rec.venue.name),
            match_key: key,
            public_notes: rec.contacts.length ? null : rec.notes,
          };
          newVenues.set(key, created);
          venues.push(created);
          report.venuesCreated++;
        }
        venueId = created.id as string;
        venueInfo = { ...rec.venue, owner_user_id: userId };
      }
    }

    // Contacts : on ignore ceux que l'artiste a déjà (même e-mail, ou même lieu + nom sans e-mail)
    let firstContactId: string | null = null;
    const labels: string[] = [];
    for (const c of rec.contacts) {
      const dupKey = c.email_normalized ?? noEmailKey(venueId, c);
      const seen = c.email_normalized ? emails : noEmail;
      if (seen.has(dupKey)) {
        report.duplicates++;
        continue;
      }
      seen.add(dupKey);
      const id = newId();
      firstContactId ??= id;
      contacts.push({ id, venue_id: venueId, ...c, email_valid: c.email_normalized ? 1 : 0 });
      report.contactsNew++;
      labels.push(c.email ?? ([c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.instagram || "contact"));
      master.push({
        venue_id: venueInfo && venueInfo.owner_user_id === null ? venueId : null,
        venue_name: venueInfo?.name,
        venue_type: venueInfo?.type,
        genres: venueInfo?.genres,
        city: venueInfo?.city,
        department: venueInfo?.department,
        region: venueInfo?.region,
        ...c,
      });
    }

    // Démarche (une seule par lieu hors campagne)
    if (rec.outreach && venueId && !outreachVenues.has(venueId)) {
      outreachVenues.add(venueId);
      outreach.push({ id: newId(), venue_id: venueId, contact_id: firstContactId, ...rec.outreach });
      report.outreachNew++;
    }

    if (report.sample.length < 10) {
      report.sample.push({ line, venue: rec.venue?.name ?? null, city: rec.venue?.city ?? null, known, contacts: labels, status: rec.outreach?.status ?? null });
    }
  });

  report.invalid = report.invalid.slice(0, 100);
  report.invalidEmails = report.invalidEmails.slice(0, 100);
  return { report, venues, contacts, outreach, master };
}

/** Rapport de rapprochement, sans rien enregistrer. */
export async function previewImport(userId: string, p: ImportPayload) {
  return (await plan(userId, p)).report;
}

/** Enregistre l'import d'un bloc et le copie dans la base maître. */
export async function commitImport(user: PublicUser, p: ImportPayload) {
  const result = await plan(user.id, p);
  const { report } = result;
  if (!report.rowsValid) throw new ImportError("Aucune ligne valide à importer.");
  const importId = newId();
  const statements = importStatements(user.id, {
    importRow: {
      id: importId,
      filename: p.filename,
      sheet: p.sheet,
      rows_total: report.rowsTotal,
      rows_imported: report.contactsNew,
      rows_duplicates: report.duplicates,
      rows_invalid: report.rowsTotal - report.rowsValid,
      venues_matched: report.venuesMatched,
      venues_created: report.venuesCreated,
      outreach_created: report.outreachNew,
      mapping: JSON.stringify(p.mapping),
      targets: null,
    },
    venues: result.venues,
    contacts: result.contacts,
    outreach: result.outreach,
  });
  statements.push(
    ...copyToMasterStatements(result.master, { userId: user.id, userLabel: user.pseudo, importId, importFilename: p.filename }),
  );
  await sql.batch(statements);
  return { importId, report };
}
