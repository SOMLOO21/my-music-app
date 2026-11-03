// Booking : toutes les requêtes côté artiste.
// Règle de cloisonnement : chaque fonction prend userId (celui de currentUser(), jamais une valeur
// envoyée par le navigateur) en premier paramètre et filtre dessus. Un objet qui n'appartient pas
// à l'artiste est traité comme inexistant (null / false → la route renvoie 404).
// Aucune fonction de ce fichier ne lit bk_master_contacts ni bk_master_sources.
import { sql } from "@/lib/sql";
import { isValidEmail, normalizeEmail, slugify, venueMatchKey } from "./normalize";
import {
  ANSWERED,
  NO_FOLLOWUP,
  isOutreachStatus,
  type Campaign,
  type CampaignInput,
  type Contact,
  type ContactInput,
  type Dashboard,
  type Import,
  type Outreach,
  type OutreachInput,
  type Profile,
  type ProfileInput,
  type Template,
  type TemplateInput,
  type Venue,
  type VenueInput,
} from "./types";

const db = () => sql;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID().replace(/-/g, "");
const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
};
const sqlList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

type Row = Record<string, unknown>;
/** Ne garde que les champs fournis : une modification partielle n'efface pas les autres. */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const parseJson = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const toVenue = (r: Row) => ({ ...r, genres: parseJson<string[]>(r.genres, []) }) as Venue;
const toTemplate = (r: Row) => ({ ...r, venue_types: parseJson<string[]>(r.venue_types, []) }) as Template;

// --- Lieux -------------------------------------------------------------------

/** Lieux visibles par l'artiste : annuaire publié + ses lieux privés. Utilise le paramètre ?1. */
const VISIBLE = "((v.owner_user_id IS NULL AND v.status = 'published') OR v.owner_user_id = ?1)";

export interface VenueFilters {
  q?: string;
  type?: string;
  genre?: string;
  city?: string;
  department?: string;
  region?: string;
  capacityMin?: number;
  capacityMax?: number;
  format?: string;
  privateOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listVenues(userId: string, f: VenueFilters = {}) {
  const where = [VISIBLE];
  const args: unknown[] = [userId];
  const add = (clause: string, value: unknown) => {
    args.push(value);
    where.push(clause.replaceAll("?", `?${args.length}`));
  };
  if (f.q) add("(v.name LIKE ? OR v.city LIKE ?)", `%${f.q}%`);
  if (f.type) add("v.type = ?", f.type);
  if (f.genre) add("EXISTS (SELECT 1 FROM json_each(v.genres) g WHERE g.value = ?)", f.genre);
  if (f.city) add("v.city = ? COLLATE NOCASE", f.city);
  if (f.department) add("v.department = ?", f.department);
  if (f.region) add("v.region = ?", f.region);
  if (f.capacityMin != null) add("v.capacity >= ?", f.capacityMin);
  if (f.capacityMax != null) add("v.capacity <= ?", f.capacityMax);
  if (f.format) add("v.usual_format = ?", f.format);
  if (f.privateOnly) where.push("v.owner_user_id = ?1");
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const { results } = await db()
    .prepare(
      `SELECT v.* FROM bk_venues v WHERE ${where.join(" AND ")}
       ORDER BY v.name COLLATE NOCASE LIMIT ${limit} OFFSET ${Math.max(f.offset ?? 0, 0)}`,
    )
    .bind(...args)
    .all<Row>();
  return results.map(toVenue);
}

export async function getVenue(userId: string, venueId: string): Promise<Venue | null> {
  const row = await db().prepare(`SELECT v.* FROM bk_venues v WHERE v.id = ?2 AND ${VISIBLE}`).bind(userId, venueId).first<Row>();
  return row ? toVenue(row) : null;
}

/** Lieu visible correspondant à un nom + ville (l'annuaire partagé d'abord). */
export async function findVenueByName(userId: string, name: string, city: string | null): Promise<Venue | null> {
  const row = await db()
    .prepare(`SELECT v.* FROM bk_venues v WHERE v.match_key = ?2 AND ${VISIBLE} ORDER BY v.owner_user_id IS NOT NULL LIMIT 1`)
    .bind(userId, venueMatchKey(name, city))
    .first<Row>();
  return row ? toVenue(row) : null;
}

const VENUE_FIELDS = [
  "type", "city", "department", "region", "capacity", "website", "instagram", "booking_period", "usual_format", "public_notes",
] as const;

function venueValues(input: VenueInput) {
  const capacity = input.capacity == null || input.capacity === ("" as unknown) ? null : Math.round(Number(input.capacity));
  return {
    type: clean(input.type),
    city: clean(input.city),
    department: clean(input.department),
    region: clean(input.region),
    capacity: Number.isFinite(capacity) && capacity! >= 0 ? capacity : null,
    website: clean(input.website),
    instagram: clean(input.instagram),
    booking_period: clean(input.booking_period),
    usual_format: clean(input.usual_format),
    public_notes: clean(input.public_notes),
    genres: JSON.stringify(Array.isArray(input.genres) ? input.genres.filter((g) => typeof g === "string") : []),
  };
}

/** Crée un lieu privé, visible seulement par l'artiste. */
export async function createPrivateVenue(userId: string, input: VenueInput & { name: string }): Promise<Venue | null> {
  const name = clean(input.name);
  if (!name) return null;
  const v = venueValues(input);
  const id = newId();
  const at = now();
  await db()
    .prepare(
      `INSERT INTO bk_venues (id, owner_user_id, status, name, slug, match_key, genres, ${VENUE_FIELDS.join(", ")}, created_at, updated_at)
       VALUES (?1, ?2, 'published', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)`,
    )
    .bind(
      id, userId, name, slugify(name), venueMatchKey(name, v.city), v.genres,
      ...VENUE_FIELDS.map((k) => v[k]), at,
    )
    .run();
  return getVenue(userId, id);
}

/** Modifie un lieu privé de l'artiste (les lieux de l'annuaire ne sont modifiables que par l'équipe). */
export async function updatePrivateVenue(userId: string, venueId: string, input: VenueInput): Promise<Venue | null> {
  const current = await db()
    .prepare("SELECT * FROM bk_venues WHERE id = ?1 AND owner_user_id = ?2")
    .bind(venueId, userId)
    .first<Row>();
  if (!current) return null;
  const merged = { ...toVenue(current), ...defined(input) };
  const name = clean(merged.name) ?? (current.name as string);
  const v = venueValues(merged);
  await db()
    .prepare(
      `UPDATE bk_venues SET name = ?3, slug = ?4, match_key = ?5, genres = ?6,
         ${VENUE_FIELDS.map((k, i) => `${k} = ?${i + 7}`).join(", ")}, updated_at = ?17
       WHERE id = ?1 AND owner_user_id = ?2`,
    )
    .bind(venueId, userId, name, slugify(name), venueMatchKey(name, v.city), v.genres, ...VENUE_FIELDS.map((k) => v[k]), now())
    .run();
  return getVenue(userId, venueId);
}

/** Supprime un lieu privé : ses démarches sont supprimées, ses contacts détachés. */
export async function deletePrivateVenue(userId: string, venueId: string): Promise<boolean> {
  const owned = await db().prepare("SELECT 1 FROM bk_venues WHERE id = ?1 AND owner_user_id = ?2").bind(venueId, userId).first();
  if (!owned) return false;
  await db().batch([
    db().prepare("DELETE FROM bk_outreach WHERE user_id = ?1 AND venue_id = ?2").bind(userId, venueId),
    db().prepare("UPDATE bk_contacts SET venue_id = NULL, updated_at = ?3 WHERE user_id = ?1 AND venue_id = ?2").bind(userId, venueId, now()),
    db().prepare("DELETE FROM bk_venues WHERE id = ?1 AND owner_user_id = ?2").bind(venueId, userId),
  ]);
  return true;
}

// --- Contacts ----------------------------------------------------------------

const CONTACT_SELECT = `SELECT c.*, v.name AS venue_name, v.city AS venue_city
  FROM bk_contacts c LEFT JOIN bk_venues v ON v.id = c.venue_id`;

export async function listContacts(userId: string, f: { venueId?: string; q?: string } = {}) {
  const where = ["c.user_id = ?1"];
  const args: unknown[] = [userId];
  if (f.venueId) {
    args.push(f.venueId);
    where.push(`c.venue_id = ?${args.length}`);
  }
  if (f.q) {
    args.push(`%${f.q}%`);
    const p = `?${args.length}`;
    where.push(`(c.first_name LIKE ${p} OR c.last_name LIKE ${p} OR c.email LIKE ${p} OR v.name LIKE ${p})`);
  }
  const { results } = await db()
    .prepare(`${CONTACT_SELECT} WHERE ${where.join(" AND ")} ORDER BY v.name COLLATE NOCASE, c.last_name COLLATE NOCASE`)
    .bind(...args)
    .all<Contact>();
  return results;
}

export async function getContact(userId: string, contactId: string) {
  return db().prepare(`${CONTACT_SELECT} WHERE c.id = ?2 AND c.user_id = ?1`).bind(userId, contactId).first<Contact>();
}

function contactValues(input: ContactInput) {
  const email = clean(input.email);
  const normalized = normalizeEmail(email);
  const valid = isValidEmail(normalized);
  return {
    first_name: clean(input.first_name),
    last_name: clean(input.last_name),
    role: clean(input.role),
    email,
    email_normalized: valid ? normalized : null,
    email_valid: valid ? 1 : 0,
    phone: clean(input.phone),
    instagram: clean(input.instagram),
    notes: clean(input.notes),
  };
}

export type ContactResult = { contact: Contact } | { error: "venue" | "duplicate" | "empty" };

/** Ajoute un contact privé. Le lieu doit être visible par l'artiste. */
export async function createContact(userId: string, input: ContactInput, importId: string | null = null): Promise<ContactResult> {
  const c = contactValues(input);
  if (!c.first_name && !c.last_name && !c.email && !c.phone && !c.instagram) return { error: "empty" };
  const venueId = clean(input.venue_id);
  if (venueId && !(await getVenue(userId, venueId))) return { error: "venue" };
  if (c.email_normalized && (await findContactByEmail(userId, c.email_normalized))) return { error: "duplicate" };
  const id = newId();
  const at = now();
  await db()
    .prepare(
      `INSERT INTO bk_contacts (id, user_id, venue_id, first_name, last_name, role, email, email_normalized, email_valid,
         phone, instagram, notes, import_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`,
    )
    .bind(id, userId, venueId, c.first_name, c.last_name, c.role, c.email, c.email_normalized, c.email_valid, c.phone, c.instagram, c.notes, importId, at)
    .run();
  return { contact: (await getContact(userId, id))! };
}

export async function findContactByEmail(userId: string, email: string) {
  return db()
    .prepare("SELECT id FROM bk_contacts WHERE user_id = ?1 AND email_normalized = ?2")
    .bind(userId, normalizeEmail(email))
    .first<{ id: string }>();
}

export async function updateContact(userId: string, contactId: string, input: ContactInput): Promise<ContactResult | null> {
  const current = await getContact(userId, contactId);
  if (!current) return null;
  const c = contactValues({ ...current, ...defined(input) });
  const venueId = input.venue_id === undefined ? current.venue_id : clean(input.venue_id);
  if (venueId && venueId !== current.venue_id && !(await getVenue(userId, venueId))) return { error: "venue" };
  if (c.email_normalized && c.email_normalized !== current.email_normalized) {
    const other = await findContactByEmail(userId, c.email_normalized);
    if (other && other.id !== contactId) return { error: "duplicate" };
  }
  await db()
    .prepare(
      `UPDATE bk_contacts SET venue_id = ?3, first_name = ?4, last_name = ?5, role = ?6, email = ?7, email_normalized = ?8,
         email_valid = ?9, phone = ?10, instagram = ?11, notes = ?12, updated_at = ?13
       WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(contactId, userId, venueId, c.first_name, c.last_name, c.role, c.email, c.email_normalized, c.email_valid, c.phone, c.instagram, c.notes, now())
    .run();
  return { contact: (await getContact(userId, contactId))! };
}

/** Supprime un contact (ses démarches restent, sans contact). La copie de la base maître n'est pas touchée. */
export async function deleteContact(userId: string, contactId: string): Promise<boolean> {
  if (!(await getContact(userId, contactId))) return false;
  await db().batch([
    db().prepare("UPDATE bk_outreach SET contact_id = NULL, updated_at = ?3 WHERE user_id = ?1 AND contact_id = ?2").bind(userId, contactId, now()),
    db().prepare("DELETE FROM bk_contacts WHERE id = ?2 AND user_id = ?1").bind(userId, contactId),
  ]);
  return true;
}

// --- Profil booking ----------------------------------------------------------

export async function getProfile(userId: string) {
  return db().prepare("SELECT * FROM bk_profiles WHERE user_id = ?1").bind(userId).first<Profile>();
}

export async function saveProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const current = await getProfile(userId);
  const p = { ...current, ...defined(input) };
  const days = Math.round(Number(p.followup_days ?? 10));
  await db()
    .prepare(
      `INSERT INTO bk_profiles (user_id, stage_name, style, city, epk_url, live_url, smartlink_url, followup_days, signature, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT (user_id) DO UPDATE SET stage_name = ?2, style = ?3, city = ?4, epk_url = ?5, live_url = ?6,
         smartlink_url = ?7, followup_days = ?8, signature = ?9, updated_at = ?10`,
    )
    .bind(
      userId, clean(p.stage_name), clean(p.style), clean(p.city), clean(p.epk_url), clean(p.live_url), clean(p.smartlink_url),
      Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 10, clean(p.signature), now(),
    )
    .run();
  return (await getProfile(userId))!;
}

// --- Modèles de mails --------------------------------------------------------

/** Modèles Mymusicads + modèles personnels de l'artiste. */
export async function listTemplates(userId: string) {
  const { results } = await db()
    .prepare("SELECT * FROM bk_templates WHERE user_id IS NULL OR user_id = ?1 ORDER BY user_id IS NOT NULL, code, name")
    .bind(userId)
    .all<Row>();
  return results.map(toTemplate);
}

export async function getTemplate(userId: string, templateId: string): Promise<Template | null> {
  const row = await db()
    .prepare("SELECT * FROM bk_templates WHERE id = ?2 AND (user_id IS NULL OR user_id = ?1)")
    .bind(userId, templateId)
    .first<Row>();
  return row ? toTemplate(row) : null;
}

/** Copie un modèle (Mymusicads ou personnel) en modèle personnel modifiable. */
export async function duplicateTemplate(userId: string, templateId: string): Promise<Template | null> {
  const t = await getTemplate(userId, templateId);
  if (!t) return null;
  const id = newId();
  const at = now();
  await db()
    .prepare(
      `INSERT INTO bk_templates (id, user_id, code, based_on, name, usage, venue_types, subject, body, created_at, updated_at)
       VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
    )
    .bind(id, userId, t.id, `${t.name} (ma version)`, t.usage, JSON.stringify(t.venue_types), t.subject, t.body, at)
    .run();
  return getTemplate(userId, id);
}

/** Modifie un modèle personnel (les modèles Mymusicads sont en lecture seule). */
export async function updateTemplate(userId: string, templateId: string, input: TemplateInput): Promise<Template | null> {
  const row = await db().prepare("SELECT * FROM bk_templates WHERE id = ?2 AND user_id = ?1").bind(userId, templateId).first<Row>();
  if (!row) return null;
  const t = { ...toTemplate(row), ...defined(input) };
  await db()
    .prepare("UPDATE bk_templates SET name = ?3, usage = ?4, venue_types = ?5, subject = ?6, body = ?7, updated_at = ?8 WHERE id = ?2 AND user_id = ?1")
    .bind(userId, templateId, clean(t.name) ?? "Sans titre", t.usage, JSON.stringify(t.venue_types ?? []), String(t.subject ?? ""), String(t.body ?? ""), now())
    .run();
  return getTemplate(userId, templateId);
}

export async function deleteTemplate(userId: string, templateId: string): Promise<boolean> {
  const owned = await db().prepare("SELECT 1 FROM bk_templates WHERE id = ?2 AND user_id = ?1").bind(userId, templateId).first();
  if (!owned) return false;
  await db().prepare("DELETE FROM bk_templates WHERE id = ?2 AND user_id = ?1").bind(userId, templateId).run();
  return true;
}

// --- Campagnes ---------------------------------------------------------------

export async function listCampaigns(userId: string) {
  const { results } = await db()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM bk_outreach o WHERE o.campaign_id = c.id AND o.user_id = ?1) AS outreach_count
       FROM bk_campaigns c WHERE c.user_id = ?1 ORDER BY c.created_at DESC`,
    )
    .bind(userId)
    .all<Campaign>();
  return results;
}

export async function getCampaign(userId: string, campaignId: string) {
  return db().prepare("SELECT * FROM bk_campaigns WHERE id = ?2 AND user_id = ?1").bind(userId, campaignId).first<Campaign>();
}

export async function createCampaign(userId: string, input: CampaignInput): Promise<Campaign | null> {
  const name = clean(input.name);
  if (!name) return null;
  const id = newId();
  const at = now();
  await db()
    .prepare("INSERT INTO bk_campaigns (id, user_id, name, target_period, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
    .bind(id, userId, name, clean(input.target_period), clean(input.notes), at)
    .run();
  return getCampaign(userId, id);
}

export async function updateCampaign(userId: string, campaignId: string, input: CampaignInput): Promise<Campaign | null> {
  const current = await getCampaign(userId, campaignId);
  if (!current) return null;
  const c = { ...current, ...defined(input) };
  await db()
    .prepare("UPDATE bk_campaigns SET name = ?3, target_period = ?4, notes = ?5, updated_at = ?6 WHERE id = ?2 AND user_id = ?1")
    .bind(userId, campaignId, clean(c.name) ?? current.name, clean(c.target_period), clean(c.notes), now())
    .run();
  return getCampaign(userId, campaignId);
}

/** Supprime une campagne : ses démarches sont conservées, sans campagne. */
export async function deleteCampaign(userId: string, campaignId: string): Promise<boolean> {
  if (!(await getCampaign(userId, campaignId))) return false;
  await db().batch([
    db().prepare("UPDATE bk_outreach SET campaign_id = NULL, updated_at = ?3 WHERE user_id = ?1 AND campaign_id = ?2").bind(userId, campaignId, now()),
    db().prepare("DELETE FROM bk_campaigns WHERE id = ?2 AND user_id = ?1").bind(userId, campaignId),
  ]);
  return true;
}

// --- Démarches ---------------------------------------------------------------

const OUTREACH_SELECT = `SELECT o.*, v.name AS venue_name, v.city AS venue_city, v.type AS venue_type,
    TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS contact_name, c.email AS contact_email,
    k.name AS campaign_name
  FROM bk_outreach o
  JOIN bk_venues v ON v.id = o.venue_id
  LEFT JOIN bk_contacts c ON c.id = o.contact_id AND c.user_id = o.user_id
  LEFT JOIN bk_campaigns k ON k.id = o.campaign_id AND k.user_id = o.user_id`;

export async function listOutreach(userId: string, f: { campaignId?: string; status?: string } = {}) {
  const where = ["o.user_id = ?1"];
  const args: unknown[] = [userId];
  if (f.campaignId) {
    args.push(f.campaignId);
    where.push(`o.campaign_id = ?${args.length}`);
  }
  if (f.status && isOutreachStatus(f.status)) {
    args.push(f.status);
    where.push(`o.status = ?${args.length}`);
  }
  const { results } = await db()
    .prepare(`${OUTREACH_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.updated_at DESC`)
    .bind(...args)
    .all<Outreach>();
  return results;
}

export async function getOutreach(userId: string, outreachId: string) {
  return db().prepare(`${OUTREACH_SELECT} WHERE o.id = ?2 AND o.user_id = ?1`).bind(userId, outreachId).first<Outreach>();
}

/** Vérifie que campagne, contact et modèle appartiennent à l'artiste (ou sont des modèles Mymusicads). */
async function checkRefs(userId: string, input: OutreachInput) {
  if (input.campaign_id && !(await getCampaign(userId, input.campaign_id))) return false;
  if (input.contact_id && !(await getContact(userId, input.contact_id))) return false;
  if (input.template_id && !(await getTemplate(userId, input.template_id))) return false;
  return true;
}

const feeCents = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Crée une démarche sur un lieu visible. Si le lieu est déjà dans la campagne, renvoie la démarche existante. */
export async function createOutreach(userId: string, venueId: string, input: OutreachInput = {}): Promise<Outreach | null> {
  if (!(await getVenue(userId, venueId)) || !(await checkRefs(userId, input))) return null;
  const status = isOutreachStatus(input.status) ? input.status : "to_contact";
  const id = newId();
  const at = now();
  const contacted = status !== "to_contact";
  await db()
    .prepare(
      `INSERT OR IGNORE INTO bk_outreach (id, user_id, campaign_id, venue_id, contact_id, status, channel, template_id,
         first_contact_at, last_action_at, proposed_dates, deal_type, fee_cents, notes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)`,
    )
    .bind(
      id, userId, clean(input.campaign_id), venueId, clean(input.contact_id), status, clean(input.channel), clean(input.template_id),
      clean(input.first_contact_at) ?? (contacted ? at : null), contacted ? at : null,
      clean(input.proposed_dates), clean(input.deal_type), feeCents(input.fee_cents), clean(input.notes), at,
    )
    .run();
  const created = await getOutreach(userId, id);
  if (created || !input.campaign_id) return created;
  const existing = await db()
    .prepare("SELECT id FROM bk_outreach WHERE user_id = ?1 AND campaign_id = ?2 AND venue_id = ?3")
    .bind(userId, input.campaign_id, venueId)
    .first<{ id: string }>();
  return existing ? getOutreach(userId, existing.id) : null;
}

/** Ajoute plusieurs lieux à une campagne (une démarche « À contacter » par lieu). Renvoie le nombre de lieux ajoutés. */
export async function addVenuesToCampaign(userId: string, campaignId: string, venueIds: string[]): Promise<number | null> {
  if (!(await getCampaign(userId, campaignId))) return null;
  let added = 0;
  for (const venueId of [...new Set(venueIds)].slice(0, 500)) {
    const before = await db()
      .prepare("SELECT 1 FROM bk_outreach WHERE user_id = ?1 AND campaign_id = ?2 AND venue_id = ?3")
      .bind(userId, campaignId, venueId)
      .first();
    if (!before && (await createOutreach(userId, venueId, { campaign_id: campaignId }))) added++;
  }
  return added;
}

/** Modifie une démarche ; chaque modification met à jour la date de dernière action. */
export async function updateOutreach(userId: string, outreachId: string, input: OutreachInput): Promise<Outreach | null> {
  const current = await getOutreach(userId, outreachId);
  if (!current || !(await checkRefs(userId, input))) return null;
  const o = { ...current, ...defined(input) };
  const status = isOutreachStatus(o.status) ? o.status : current.status;
  const at = now();
  const firstContact = clean(o.first_contact_at) ?? (status !== "to_contact" ? at : null);
  await db()
    .prepare(
      `UPDATE bk_outreach SET campaign_id = ?3, contact_id = ?4, status = ?5, channel = ?6, template_id = ?7,
         first_contact_at = ?8, last_action_at = ?9, proposed_dates = ?10, deal_type = ?11, fee_cents = ?12, notes = ?13, updated_at = ?9
       WHERE id = ?2 AND user_id = ?1`,
    )
    .bind(
      userId, outreachId, clean(o.campaign_id), clean(o.contact_id), status, clean(o.channel), clean(o.template_id),
      firstContact, at, clean(o.proposed_dates), clean(o.deal_type), feeCents(o.fee_cents), clean(o.notes),
    )
    .run();
  return getOutreach(userId, outreachId);
}

export async function deleteOutreach(userId: string, outreachId: string): Promise<boolean> {
  if (!(await getOutreach(userId, outreachId))) return false;
  await db().prepare("DELETE FROM bk_outreach WHERE id = ?2 AND user_id = ?1").bind(userId, outreachId).run();
  return true;
}

// --- Relances et tableau de bord ---------------------------------------------

const DUE_ON = "date(o.last_action_at, '+' || COALESCE(p.followup_days, 10) || ' days')";

/** Démarches à relancer au plus tard le jour donné (AAAA-MM-JJ), les plus en retard d'abord. */
export async function listFollowupsDue(userId: string, today = now().slice(0, 10)) {
  const { results } = await db()
    .prepare(
      `SELECT * FROM (
         SELECT o.*, v.name AS venue_name, v.city AS venue_city, v.type AS venue_type,
           TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS contact_name, c.email AS contact_email,
           k.name AS campaign_name, ${DUE_ON} AS due_on
         FROM bk_outreach o
         JOIN bk_venues v ON v.id = o.venue_id
         LEFT JOIN bk_profiles p ON p.user_id = o.user_id
         LEFT JOIN bk_contacts c ON c.id = o.contact_id AND c.user_id = o.user_id
         LEFT JOIN bk_campaigns k ON k.id = o.campaign_id AND k.user_id = o.user_id
         WHERE o.user_id = ?1 AND o.last_action_at IS NOT NULL AND o.status NOT IN (${sqlList(NO_FOLLOWUP)})
       ) WHERE due_on <= ?2 ORDER BY due_on`,
    )
    .bind(userId, today)
    .all<Outreach>();
  return results;
}

export async function getDashboard(userId: string, today = now().slice(0, 10)): Promise<Dashboard> {
  const row = await db()
    .prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN o.campaign_id IS NOT NULL THEN o.venue_id END) AS venues_in_campaign,
         COALESCE(SUM(o.status != 'to_contact'), 0) AS sent,
         COALESCE(SUM(o.status IN (${sqlList(ANSWERED)})), 0) AS answered,
         COALESCE(SUM(o.status = 'confirmed'), 0) AS confirmed,
         COALESCE(SUM(o.last_action_at IS NOT NULL AND o.status NOT IN (${sqlList(NO_FOLLOWUP)}) AND ${DUE_ON} < ?2), 0) AS late,
         COALESCE(SUM(CASE WHEN o.status = 'confirmed' THEN o.fee_cents END), 0) AS fees
       FROM bk_outreach o LEFT JOIN bk_profiles p ON p.user_id = o.user_id
       WHERE o.user_id = ?1`,
    )
    .bind(userId, today)
    .first<Record<string, number>>();
  const sent = Number(row?.sent ?? 0);
  const answered = Number(row?.answered ?? 0);
  return {
    venuesInCampaign: Number(row?.venues_in_campaign ?? 0),
    sent,
    answered,
    responseRate: sent ? answered / sent : null,
    confirmed: Number(row?.confirmed ?? 0),
    lateFollowups: Number(row?.late ?? 0),
    confirmedFeesCents: Number(row?.fees ?? 0),
  };
}

// --- Imports -----------------------------------------------------------------

export async function listImports(userId: string) {
  const { results } = await db()
    .prepare("SELECT * FROM bk_imports WHERE user_id = ?1 ORDER BY created_at DESC")
    .bind(userId)
    .all<Import>();
  return results;
}

export async function getImport(userId: string, importId: string) {
  return db().prepare("SELECT * FROM bk_imports WHERE id = ?2 AND user_id = ?1").bind(userId, importId).first<Import>();
}

// --- Smart links (app Link) ---------------------------------------------------

/** Smart links My Music Link de l'artiste, proposés dans le profil booking. */
export async function listSmartLinks(userId: string) {
  const { results } = await db()
    .prepare("SELECT slug, title, artist FROM ml_links WHERE user_id = ?1 ORDER BY created_at DESC")
    .bind(userId)
    .all<{ slug: string; title: string; artist: string }>();
  return results;
}

// --- Import de fichier ---------------------------------------------------------

/** Ce qu'il faut savoir pour rapprocher un import : lieux visibles, contacts et démarches déjà présents. */
export async function getImportContext(userId: string) {
  const [venues, contacts, outreach] = await Promise.all([
    db()
      .prepare(`SELECT v.* FROM bk_venues v WHERE ${VISIBLE} ORDER BY v.owner_user_id IS NOT NULL`)
      .bind(userId)
      .all<Row>(),
    db()
      .prepare("SELECT venue_id, first_name, last_name, email_normalized, phone, instagram FROM bk_contacts WHERE user_id = ?1")
      .bind(userId)
      .all<Pick<Contact, "venue_id" | "first_name" | "last_name" | "email_normalized" | "phone" | "instagram">>(),
    db()
      .prepare("SELECT DISTINCT venue_id FROM bk_outreach WHERE user_id = ?1 AND campaign_id IS NULL")
      .bind(userId)
      .all<{ venue_id: string }>(),
  ]);
  return { venues: venues.results.map(toVenue), contacts: contacts.results, outreachVenueIds: new Set(outreach.results.map((o) => o.venue_id)) };
}

export interface ImportPlanData {
  importRow: Omit<Import, "user_id" | "created_at">;
  venues: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  outreach: Record<string, unknown>[];
}

/**
 * Requêtes d'enregistrement d'un import (à passer à sql.batch avec la copie dans la base maître).
 * userId est lié en paramètre : les lignes JSON ne choisissent jamais le propriétaire.
 */
export function importStatements(userId: string, plan: ImportPlanData) {
  const at = now();
  const i = plan.importRow;
  const j = (f: string) => `j.value ->> '${f}'`;
  const statements = [
    db()
      .prepare(
        `INSERT INTO bk_imports (id, user_id, filename, sheet, rows_total, rows_imported, rows_duplicates, rows_invalid,
           venues_matched, venues_created, outreach_created, mapping, targets, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13)`,
      )
      .bind(i.id, userId, i.filename, i.sheet, i.rows_total, i.rows_imported, i.rows_duplicates, i.rows_invalid, i.venues_matched, i.venues_created, i.outreach_created, i.mapping, at),
  ];
  const venueCols = ["id", "name", "slug", "match_key", "type", "genres", "city", "department", "region", "capacity", "website", "instagram", "booking_period", "usual_format", "public_notes"];
  if (plan.venues.length) {
    statements.push(
      db()
        .prepare(
          `INSERT INTO bk_venues (${venueCols.join(", ")}, owner_user_id, status, created_at, updated_at)
           SELECT ${venueCols.map(j).join(", ")}, ?2, 'published', ?3, ?3 FROM json_each(?1) j`,
        )
        .bind(JSON.stringify(plan.venues), userId, at),
    );
  }
  const contactCols = ["id", "venue_id", "first_name", "last_name", "role", "email", "email_normalized", "email_valid", "phone", "instagram", "notes"];
  if (plan.contacts.length) {
    statements.push(
      db()
        .prepare(
          `INSERT OR IGNORE INTO bk_contacts (${contactCols.join(", ")}, user_id, import_id, created_at, updated_at)
           SELECT ${contactCols.map(j).join(", ")}, ?2, ?3, ?4, ?4 FROM json_each(?1) j`,
        )
        .bind(JSON.stringify(plan.contacts), userId, i.id, at),
    );
  }
  const outreachCols = ["id", "venue_id", "contact_id", "status", "channel", "first_contact_at", "last_action_at", "proposed_dates", "deal_type", "fee_cents"];
  if (plan.outreach.length) {
    statements.push(
      db()
        .prepare(
          `INSERT INTO bk_outreach (${outreachCols.join(", ")}, user_id, import_id, created_at, updated_at)
           SELECT ${outreachCols.map(j).join(", ")}, ?2, ?3, ?4, ?4 FROM json_each(?1) j`,
        )
        .bind(JSON.stringify(plan.outreach), userId, i.id, at),
    );
  }
  return statements;
}
