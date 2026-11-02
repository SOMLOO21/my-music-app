// Booking : types des tables bk_* (migrations/0006_booking.sql) et listes fixes.

/** Codes des statuts d'une démarche. Les libellés sont modifiables (bk_taxonomy « status »), pas les codes. */
export const OUTREACH_STATUSES = [
  "to_contact",
  "contacted",
  "followup_1",
  "followup_2",
  "discussing",
  "hold",
  "confirmed",
  "declined",
  "no_reply",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const STATUS_LABELS: Record<OutreachStatus, string> = {
  to_contact: "À contacter",
  contacted: "Contacté",
  followup_1: "Relance 1",
  followup_2: "Relance 2",
  discussing: "En discussion",
  hold: "Option posée",
  confirmed: "Confirmé",
  declined: "Refusé",
  no_reply: "Sans réponse (clos)",
};

/** Statuts pour lesquels aucune relance n'est proposée. */
export const NO_FOLLOWUP: OutreachStatus[] = ["to_contact", "confirmed", "declined", "no_reply"];
/** Statuts qui comptent comme une réponse du lieu (taux de réponse). */
export const ANSWERED: OutreachStatus[] = ["discussing", "hold", "confirmed", "declined"];

export const isOutreachStatus = (s: unknown): s is OutreachStatus => OUTREACH_STATUSES.includes(s as OutreachStatus);

export type MasterStatus = "to_check" | "verified" | "invalid" | "removed";
export const MASTER_STATUSES: MasterStatus[] = ["to_check", "verified", "invalid", "removed"];
export type EmailKind = "generic" | "personal";
export type VenueStatus = "draft" | "published";
export type TemplateUsage = "first_contact" | "followup_1" | "followup_2" | "opening" | "thanks" | "festival";

export interface Venue {
  id: string;
  owner_user_id: string | null;
  status: VenueStatus;
  name: string;
  slug: string;
  match_key: string;
  type: string | null;
  genres: string[];
  city: string | null;
  department: string | null;
  region: string | null;
  capacity: number | null;
  website: string | null;
  instagram: string | null;
  booking_period: string | null;
  usual_format: string | null;
  public_notes: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Champs d'un lieu modifiables par un artiste (lieu privé) ou l'équipe (annuaire). */
export type VenueInput = Partial<
  Pick<
    Venue,
    | "name"
    | "type"
    | "genres"
    | "city"
    | "department"
    | "region"
    | "capacity"
    | "website"
    | "instagram"
    | "booking_period"
    | "usual_format"
    | "public_notes"
  >
>;

export interface Contact {
  id: string;
  user_id: string;
  venue_id: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  email: string | null;
  email_normalized: string | null;
  email_valid: number;
  phone: string | null;
  instagram: string | null;
  notes: string | null;
  import_id: string | null;
  created_at: string;
  updated_at: string;
  /** Jointure : nom et ville du lieu rattaché. */
  venue_name?: string | null;
  venue_city?: string | null;
}

export type ContactInput = Partial<
  Pick<Contact, "venue_id" | "first_name" | "last_name" | "role" | "email" | "phone" | "instagram" | "notes">
>;

export interface Import {
  id: string;
  user_id: string | null;
  filename: string;
  sheet: string | null;
  rows_total: number;
  rows_imported: number;
  rows_duplicates: number;
  rows_invalid: number;
  venues_matched: number;
  venues_created: number;
  outreach_created: number;
  mapping: string;
  targets: string | null;
  created_at: string;
}

export interface Profile {
  user_id: string;
  stage_name: string | null;
  style: string | null;
  city: string | null;
  epk_url: string | null;
  live_url: string | null;
  smartlink_url: string | null;
  followup_days: number;
  signature: string | null;
  updated_at: string;
}

export type ProfileInput = Partial<Omit<Profile, "user_id" | "updated_at">>;

export interface Template {
  id: string;
  user_id: string | null;
  code: string | null;
  based_on: string | null;
  name: string;
  usage: TemplateUsage;
  venue_types: string[];
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export type TemplateInput = Partial<Pick<Template, "name" | "usage" | "venue_types" | "subject" | "body">>;

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  target_period: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Jointure : nombre de démarches de la campagne. */
  outreach_count?: number;
}

export type CampaignInput = Partial<Pick<Campaign, "name" | "target_period" | "notes">>;

export interface Outreach {
  id: string;
  user_id: string;
  campaign_id: string | null;
  venue_id: string;
  contact_id: string | null;
  status: OutreachStatus;
  channel: string | null;
  template_id: string | null;
  first_contact_at: string | null;
  last_action_at: string | null;
  proposed_dates: string | null;
  deal_type: string | null;
  fee_cents: number | null;
  notes: string | null;
  import_id: string | null;
  created_at: string;
  updated_at: string;
  /** Jointures */
  venue_name?: string;
  venue_city?: string | null;
  venue_type?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  campaign_name?: string | null;
  /** Relances : date prévue (AAAA-MM-JJ). */
  due_on?: string | null;
}

export type OutreachInput = Partial<
  Pick<
    Outreach,
    | "campaign_id"
    | "contact_id"
    | "status"
    | "channel"
    | "template_id"
    | "first_contact_at"
    | "proposed_dates"
    | "deal_type"
    | "fee_cents"
    | "notes"
  >
>;

export interface Dashboard {
  venuesInCampaign: number;
  sent: number;
  answered: number;
  /** Entre 0 et 1, null si rien n'a été envoyé. */
  responseRate: number | null;
  confirmed: number;
  lateFollowups: number;
  confirmedFeesCents: number;
}

export interface MasterContact {
  id: string;
  dedupe_key: string;
  venue_id: string | null;
  venue_name: string | null;
  venue_type: string | null;
  genres: string[];
  city: string | null;
  department: string | null;
  region: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  email: string | null;
  email_normalized: string | null;
  email_kind: EmailKind | null;
  phone: string | null;
  instagram: string | null;
  status: MasterStatus;
  notes: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  sources_count?: number;
}

export interface MasterSource {
  id: number;
  master_contact_id: string;
  user_id: string | null;
  user_label: string | null;
  import_id: string | null;
  import_filename: string | null;
  created_at: string;
}

/** Contact à copier dans la base maître (import ou saisie). */
export interface MasterInput {
  venue_id?: string | null;
  venue_name?: string | null;
  venue_type?: string | null;
  genres?: string[];
  city?: string | null;
  department?: string | null;
  region?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
}

export interface MasterSourceInfo {
  userId: string | null;
  userLabel: string | null;
  importId: string | null;
  importFilename: string | null;
}

export interface GenreGroup {
  label: string;
  sub: string[];
}

export interface BookingTaxonomy {
  venue_type: string[];
  genre: GenreGroup[];
  usual_format: string[];
  deal_type: string[];
  channel: string[];
  status: Record<OutreachStatus, string>;
}
export type BookingFacet = keyof BookingTaxonomy;
