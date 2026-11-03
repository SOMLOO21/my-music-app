// Booking : lecture des corps de requête des routes artistes (seuls les champs attendus sont gardés).
import { normalizeDepartment, regionOfDepartment } from "./geo";
import type { ContactInput, VenueInput } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));

export function venueInput(b: Record<string, unknown>): VenueInput {
  const department = normalizeDepartment(str(b.department)) ?? undefined;
  return {
    name: str(b.name),
    type: str(b.type),
    genres: Array.isArray(b.genres) ? b.genres.filter((g): g is string => typeof g === "string").slice(0, 20) : undefined,
    city: str(b.city),
    department,
    region: str(b.region) || regionOfDepartment(department) || undefined,
    capacity: b.capacity === "" || b.capacity == null ? undefined : Number(b.capacity),
    website: str(b.website),
    instagram: str(b.instagram),
    booking_period: str(b.booking_period),
    usual_format: str(b.usual_format),
    public_notes: str(b.public_notes),
  };
}

export function contactInput(b: Record<string, unknown>): ContactInput {
  const out: ContactInput = {};
  for (const k of ["venue_id", "first_name", "last_name", "role", "email", "phone", "instagram", "notes"] as const) {
    if (k in b) out[k] = b[k] == null ? null : String(b[k]).slice(0, 2000);
  }
  return out;
}
