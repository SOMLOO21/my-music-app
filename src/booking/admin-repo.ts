// Booking : requêtes réservées à l'équipe (base maître, annuaire partagé, activité, réglages).
// À n'appeler que depuis /admin/booking et /api/admin/booking (protégés par src/proxy.ts),
// sauf copyToMaster, en écriture seule, appelée aussi par les imports et saisies des artistes.
import { sql } from "@/lib/sql";
import { emailKind, isValidEmail, masterDedupeKey, normalizeEmail, slugify, venueMatchKey } from "./normalize";
import type {
  BookingFacet,
  BookingTaxonomy,
  EmailKind,
  MasterContact,
  MasterInput,
  MasterSource,
  MasterSourceInfo,
  MasterStatus,
  Template,
  TemplateInput,
  Venue,
  VenueInput,
  VenueStatus,
} from "./types";
import { MASTER_STATUSES, STATUS_LABELS } from "./types";

const db = () => sql;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID().replace(/-/g, "");
const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
};
type Row = Record<string, unknown>;
const parseJson = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const toVenue = (r: Row) => ({ ...r, genres: parseJson<string[]>(r.genres, []) }) as Venue;
const toMaster = (r: Row) => ({ ...r, genres: parseJson<string[]>(r.genres, []) }) as MasterContact;

// --- Base maître : alimentation ----------------------------------------------

/**
 * Copie des contacts dans la base maître : upsert sur dedupe_key, mise à jour de last_seen_at,
 * champs vides complétés, une ligne de provenance par contact.
 * Un contact « removed » n'est jamais réactivé ni complété, et ne reçoit pas de nouvelle source.
 * Renvoie les requêtes, à exécuter dans le même sql.batch que l'import (tout ou rien).
 */
export function copyToMasterStatements(contacts: MasterInput[], source: MasterSourceInfo) {
  const at = now();
  const rows = new Map<string, Record<string, unknown>>();
  for (const c of contacts) {
    const key = masterDedupeKey(c);
    if (!key || rows.has(key)) continue;
    const email = normalizeEmail(c.email);
    const valid = isValidEmail(email);
    rows.set(key, {
      id: newId(),
      key,
      venue_id: clean(c.venue_id),
      venue_name: clean(c.venue_name),
      venue_type: clean(c.venue_type),
      genres: JSON.stringify(c.genres ?? []),
      city: clean(c.city),
      department: clean(c.department),
      region: clean(c.region),
      first_name: clean(c.first_name),
      last_name: clean(c.last_name),
      role: clean(c.role),
      email: valid ? clean(c.email) : null,
      email_normalized: valid ? email : null,
      email_kind: valid ? emailKind(email!) : null,
      phone: clean(c.phone),
      instagram: clean(c.instagram),
    });
  }
  if (rows.size === 0) return [];
  const json = JSON.stringify([...rows.values()]);
  const fields = [
    "venue_id", "venue_name", "venue_type", "genres", "city", "department", "region",
    "first_name", "last_name", "role", "email", "email_normalized", "email_kind", "phone", "instagram",
  ];
  const fill = fields
    .filter((f) => f !== "genres")
    .map((f) => `${f} = COALESCE(bk_master_contacts.${f}, excluded.${f})`)
    .join(", ");
  return [
    db()
      .prepare(
        `INSERT INTO bk_master_contacts (id, dedupe_key, ${fields.join(", ")}, status, first_seen_at, last_seen_at, updated_at)
         SELECT j.value ->> 'id', j.value ->> 'key', ${fields.map((f) => `j.value ->> '${f}'`).join(", ")}, 'to_check', ?2, ?2, ?2
         FROM json_each(?1) j WHERE true
         ON CONFLICT (dedupe_key) DO UPDATE SET ${fill},
           genres = CASE WHEN bk_master_contacts.genres = '[]' THEN excluded.genres ELSE bk_master_contacts.genres END,
           last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at
         WHERE bk_master_contacts.status != 'removed'`,
      )
      .bind(json, at),
    db()
      .prepare(
        `INSERT INTO bk_master_sources (master_contact_id, user_id, user_label, import_id, import_filename, created_at)
         SELECT m.id, ?2, ?3, ?4, ?5, ?6 FROM json_each(?1) j
         JOIN bk_master_contacts m ON m.dedupe_key = j.value ->> 'key'
         WHERE m.status != 'removed'`,
      )
      .bind(json, source.userId, source.userLabel, source.importId, source.importFilename, at),
  ];
}

export async function copyToMaster(contacts: MasterInput[], source: MasterSourceInfo) {
  const statements = copyToMasterStatements(contacts, source);
  if (statements.length) await db().batch(statements);
}

// --- Base maître : consultation ----------------------------------------------

export interface MasterFilters {
  q?: string;
  city?: string;
  region?: string;
  venueType?: string;
  genre?: string;
  emailKind?: EmailKind;
  status?: MasterStatus;
  /** AAAA-MM-JJ, sur first_seen_at */
  addedFrom?: string;
  addedTo?: string;
  limit?: number;
  offset?: number;
}

function masterWhere(f: MasterFilters, opts: { exportable?: boolean } = {}) {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    args.push(value);
    where.push(clause.replaceAll("?", `?${args.length}`));
  };
  if (f.q) add("(m.email LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ? OR m.venue_name LIKE ?)", `%${f.q}%`);
  if (f.city) add("m.city = ? COLLATE NOCASE", f.city);
  if (f.region) add("m.region = ?", f.region);
  if (f.venueType) add("m.venue_type = ?", f.venueType);
  if (f.genre) add("EXISTS (SELECT 1 FROM json_each(m.genres) g WHERE g.value = ?)", f.genre);
  if (f.emailKind) add("m.email_kind = ?", f.emailKind);
  if (f.status && MASTER_STATUSES.includes(f.status)) add("m.status = ?", f.status);
  if (f.addedFrom) add("m.first_seen_at >= ?", f.addedFrom);
  if (f.addedTo) add("substr(m.first_seen_at, 1, 10) <= ?", f.addedTo);
  // Un contact retiré n'est jamais exporté.
  if (opts.exportable) where.push("m.status != 'removed'");
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

export async function listMasterContacts(f: MasterFilters = {}) {
  const w = masterWhere(f);
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
  const [{ results }, total] = await Promise.all([
    db()
      .prepare(
        `SELECT m.*, (SELECT COUNT(*) FROM bk_master_sources s WHERE s.master_contact_id = m.id) AS sources_count
         FROM bk_master_contacts m ${w.sql} ORDER BY m.first_seen_at DESC LIMIT ${limit} OFFSET ${Math.max(f.offset ?? 0, 0)}`,
      )
      .bind(...w.args)
      .all<Row>(),
    db().prepare(`SELECT COUNT(*) AS n FROM bk_master_contacts m ${w.sql}`).bind(...w.args).first<{ n: number }>(),
  ]);
  return { contacts: results.map(toMaster), total: Number(total?.n ?? 0) };
}

/** Toute la sélection filtrée, sans les contacts retirés (export CSV / XLSX). */
export async function exportMasterContacts(f: MasterFilters = {}) {
  const w = masterWhere(f, { exportable: true });
  const { results } = await db()
    .prepare(`SELECT m.* FROM bk_master_contacts m ${w.sql} ORDER BY m.region, m.city, m.venue_name`)
    .bind(...w.args)
    .all<Row>();
  return results.map(toMaster);
}

export async function getMasterSources(masterContactId: string) {
  const { results } = await db()
    .prepare(
      `SELECT s.id, s.master_contact_id, s.user_id, COALESCE(u.pseudo, s.user_label) AS user_label,
         s.import_id, s.import_filename, s.created_at
       FROM bk_master_sources s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.master_contact_id = ?1 ORDER BY s.created_at DESC`,
    )
    .bind(masterContactId)
    .all<MasterSource>();
  return results;
}

/**
 * Change le statut d'un contact maître. « removed » (demande de retrait) efface les données personnelles
 * et ne garde que la clé de dédoublonnage, pour ne plus jamais réimporter ce contact.
 */
export async function setMasterStatus(masterContactId: string, status: MasterStatus): Promise<boolean> {
  if (!MASTER_STATUSES.includes(status)) return false;
  const exists = await db().prepare("SELECT 1 FROM bk_master_contacts WHERE id = ?1").bind(masterContactId).first();
  if (!exists) return false;
  const at = now();
  if (status === "removed") {
    await db()
      .prepare(
        `UPDATE bk_master_contacts SET status = 'removed', first_name = NULL, last_name = NULL, role = NULL, email = NULL,
           phone = NULL, instagram = NULL, notes = NULL, updated_at = ?2 WHERE id = ?1`,
      )
      .bind(masterContactId, at)
      .run();
  } else {
    await db().prepare("UPDATE bk_master_contacts SET status = ?2, updated_at = ?3 WHERE id = ?1").bind(masterContactId, status, at).run();
  }
  return true;
}

export async function updateMasterNotes(masterContactId: string, notes: string) {
  await db()
    .prepare("UPDATE bk_master_contacts SET notes = ?2, updated_at = ?3 WHERE id = ?1 AND status != 'removed'")
    .bind(masterContactId, clean(notes), now())
    .run();
}

// --- Annuaire partagé --------------------------------------------------------

export async function listSharedVenues(f: { q?: string; status?: VenueStatus } = {}) {
  const where = ["owner_user_id IS NULL"];
  const args: unknown[] = [];
  if (f.q) {
    args.push(`%${f.q}%`);
    where.push(`(name LIKE ?${args.length} OR city LIKE ?${args.length})`);
  }
  if (f.status) {
    args.push(f.status);
    where.push(`status = ?${args.length}`);
  }
  const { results } = await db()
    .prepare(`SELECT * FROM bk_venues WHERE ${where.join(" AND ")} ORDER BY name COLLATE NOCASE`)
    .bind(...args)
    .all<Row>();
  return results.map(toVenue);
}

export async function getVenueAdmin(venueId: string) {
  const row = await db().prepare("SELECT * FROM bk_venues WHERE id = ?1").bind(venueId).first<Row>();
  return row ? toVenue(row) : null;
}

/** Slug libre dans l'annuaire partagé (« la-cave », « la-cave-2 »…). */
async function freeSlug(name: string, exceptId: string | null) {
  const base = slugify(name) || "lieu";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db()
      .prepare("SELECT 1 FROM bk_venues WHERE owner_user_id IS NULL AND slug = ?1 AND id != ?2")
      .bind(slug, exceptId ?? "")
      .first();
    if (!taken) return slug;
  }
}

const VENUE_FIELDS = [
  "type", "city", "department", "region", "capacity", "website", "instagram", "booking_period", "usual_format", "public_notes",
] as const;

/** Crée (venueId null) ou modifie un lieu de l'annuaire partagé. */
export async function saveSharedVenue(venueId: string | null, input: VenueInput & { verified?: boolean }): Promise<Venue | null> {
  const current = venueId ? await getVenueAdmin(venueId) : null;
  if (venueId && (!current || current.owner_user_id !== null)) return null;
  const v = { ...current, ...input };
  const name = clean(v.name);
  if (!name) return null;
  const capacity = v.capacity == null ? null : Math.round(Number(v.capacity));
  const values: Record<(typeof VENUE_FIELDS)[number], unknown> = {
    type: clean(v.type),
    city: clean(v.city),
    department: clean(v.department),
    region: clean(v.region),
    capacity: Number.isFinite(capacity) && capacity! >= 0 ? capacity : null,
    website: clean(v.website),
    instagram: clean(v.instagram),
    booking_period: clean(v.booking_period),
    usual_format: clean(v.usual_format),
    public_notes: clean(v.public_notes),
  };
  const id = venueId ?? newId();
  const at = now();
  const verifiedAt = input.verified ? at : (current?.verified_at ?? null);
  await db()
    .prepare(
      `INSERT INTO bk_venues (id, owner_user_id, status, name, slug, match_key, genres, ${VENUE_FIELDS.join(", ")}, verified_at, created_at, updated_at)
       VALUES (?1, NULL, 'draft', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)
       ON CONFLICT (id) DO UPDATE SET name = ?2, slug = ?3, match_key = ?4, genres = ?5,
         ${VENUE_FIELDS.map((k, i) => `${k} = ?${i + 6}`).join(", ")}, verified_at = ?16, updated_at = ?17`,
    )
    .bind(
      id, name, await freeSlug(name, id), venueMatchKey(name, values.city as string | null),
      JSON.stringify(Array.isArray(v.genres) ? v.genres : []), ...VENUE_FIELDS.map((k) => values[k]), verifiedAt, at,
    )
    .run();
  return getVenueAdmin(id);
}

export async function setVenueStatus(venueId: string, status: VenueStatus): Promise<boolean> {
  const venue = await getVenueAdmin(venueId);
  if (!venue || venue.owner_user_id !== null || (status !== "draft" && status !== "published")) return false;
  await db().prepare("UPDATE bk_venues SET status = ?2, updated_at = ?3 WHERE id = ?1").bind(venueId, status, now()).run();
  return true;
}

/** Lieux privés créés par les artistes et absents de l'annuaire, du plus importé au moins importé. */
export async function listPrivateVenueCandidates(limit = 100) {
  const { results } = await db()
    .prepare(
      `SELECT match_key, COUNT(DISTINCT owner_user_id) AS artists, MIN(id) AS sample_id,
         MIN(name) AS name, MIN(city) AS city, MIN(type) AS type, MAX(capacity) AS capacity
       FROM bk_venues
       WHERE owner_user_id IS NOT NULL AND match_key NOT IN (SELECT match_key FROM bk_venues WHERE owner_user_id IS NULL)
       GROUP BY match_key ORDER BY artists DESC, name COLLATE NOCASE LIMIT ?1`,
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<{ match_key: string; artists: number; sample_id: string; name: string; city: string | null; type: string | null; capacity: number | null }>();
  return results;
}

/** Copie les infos d'un lieu privé dans l'annuaire partagé (brouillon). Les contacts ne sont jamais copiés. */
export async function promoteVenue(privateVenueId: string): Promise<Venue | null> {
  const source = await getVenueAdmin(privateVenueId);
  if (!source || source.owner_user_id === null) return null;
  return saveSharedVenue(null, {
    name: source.name,
    type: source.type,
    genres: source.genres,
    city: source.city,
    department: source.department,
    region: source.region,
    capacity: source.capacity,
    website: source.website,
    instagram: source.instagram,
    booking_period: source.booking_period,
    usual_format: source.usual_format,
  });
}

/**
 * Fusionne deux lieux en doublon : contacts, démarches et contacts maîtres passent sur le lieu conservé.
 * Le lieu conservé doit être partagé, ou privé du même artiste que le lieu supprimé.
 * Si un artiste avait les deux lieux dans une même campagne, sa démarche sur le lieu supprimé disparaît.
 */
export async function mergeVenues(keepId: string, dropId: string): Promise<boolean> {
  if (keepId === dropId) return false;
  const [keep, drop] = await Promise.all([getVenueAdmin(keepId), getVenueAdmin(dropId)]);
  if (!keep || !drop) return false;
  if (keep.owner_user_id !== null && keep.owner_user_id !== drop.owner_user_id) return false;
  const at = now();
  await db().batch([
    db().prepare("UPDATE bk_contacts SET venue_id = ?1, updated_at = ?3 WHERE venue_id = ?2").bind(keepId, dropId, at),
    db().prepare("UPDATE OR IGNORE bk_outreach SET venue_id = ?1, updated_at = ?3 WHERE venue_id = ?2").bind(keepId, dropId, at),
    db().prepare("DELETE FROM bk_outreach WHERE venue_id = ?1").bind(dropId),
    // La base maître ne pointe que vers des lieux partagés.
    db()
      .prepare("UPDATE bk_master_contacts SET venue_id = ?1 WHERE venue_id = ?2")
      .bind(keep.owner_user_id === null ? keepId : null, dropId),
    db().prepare("DELETE FROM bk_venues WHERE id = ?1").bind(dropId),
  ]);
  return true;
}

// --- Activité des artistes ---------------------------------------------------

export async function artistActivity() {
  const { results } = await db()
    .prepare(
      `SELECT u.id AS user_id, u.pseudo,
         (SELECT COUNT(*) FROM bk_contacts c WHERE c.user_id = u.id AND c.import_id IS NOT NULL) AS contacts_imported,
         (SELECT COUNT(*) FROM bk_contacts c WHERE c.user_id = u.id) AS contacts,
         (SELECT COUNT(*) FROM bk_imports i WHERE i.user_id = u.id) AS imports,
         (SELECT COUNT(*) FROM bk_outreach o WHERE o.user_id = u.id) AS outreach,
         (SELECT COUNT(*) FROM bk_outreach o WHERE o.user_id = u.id AND o.status = 'confirmed') AS confirmed
       FROM users u`,
    )
    .all<{ user_id: string; pseudo: string; contacts_imported: number; contacts: number; imports: number; outreach: number; confirmed: number }>();
  return results;
}

// --- Réglages : listes et modèles Mymusicads --------------------------------

export async function getBookingTaxonomy(): Promise<BookingTaxonomy> {
  const { results } = await db().prepare("SELECT facet, vals FROM bk_taxonomy").all<{ facet: BookingFacet; vals: string }>();
  const taxonomy: BookingTaxonomy = { venue_type: [], genre: [], usual_format: [], deal_type: [], channel: [], status: { ...STATUS_LABELS } };
  for (const row of results) {
    if (!(row.facet in taxonomy)) continue;
    const vals = parseJson<unknown>(row.vals, null);
    if (row.facet === "status") Object.assign(taxonomy.status, vals ?? {});
    else if (Array.isArray(vals)) (taxonomy as unknown as Record<string, unknown>)[row.facet] = vals;
  }
  return taxonomy;
}

export async function setTaxonomyFacet<F extends BookingFacet>(facet: F, vals: BookingTaxonomy[F]) {
  await db()
    .prepare("INSERT INTO bk_taxonomy (facet, vals) VALUES (?1, ?2) ON CONFLICT (facet) DO UPDATE SET vals = ?2")
    .bind(facet, JSON.stringify(vals))
    .run();
}

export async function listMymusicadsTemplates() {
  const { results } = await db().prepare("SELECT * FROM bk_templates WHERE user_id IS NULL ORDER BY code").all<Row>();
  return results.map((r) => ({ ...r, venue_types: parseJson<string[]>(r.venue_types, []) }) as Template);
}

export async function updateMymusicadsTemplate(templateId: string, input: TemplateInput): Promise<boolean> {
  const row = await db().prepare("SELECT * FROM bk_templates WHERE id = ?1 AND user_id IS NULL").bind(templateId).first<Row>();
  if (!row) return false;
  const t = { ...row, ...input } as Template;
  await db()
    .prepare("UPDATE bk_templates SET name = ?2, venue_types = ?3, subject = ?4, body = ?5, updated_at = ?6 WHERE id = ?1 AND user_id IS NULL")
    .bind(templateId, String(t.name), JSON.stringify(Array.isArray(t.venue_types) ? t.venue_types : parseJson(t.venue_types, [])), String(t.subject), String(t.body), now())
    .run();
  return true;
}
