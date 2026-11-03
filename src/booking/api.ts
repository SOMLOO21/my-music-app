// Booking : appels aux routes /api/booking depuis le navigateur.
import type { Contact, Profile, Venue } from "./types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new Error("Ta session a expiré : reconnecte-toi.");
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue, réessaie dans un instant.");
  return data as T;
}
const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export type NewVenue = { name: string; city?: string; type?: string };
export type ContactPayload = Partial<
  Pick<Contact, "venue_id" | "first_name" | "last_name" | "role" | "email" | "phone" | "instagram" | "notes">
> & { new_venue?: NewVenue };

export const saveProfile = (p: Partial<Profile>) => call<Profile>("/api/booking/profile", json("PUT", p));

export const searchVenues = (params: Record<string, string>) =>
  call<{ venues: Venue[]; more: boolean }>(`/api/booking/venues?${new URLSearchParams(params)}`);
export const deleteVenue = (id: string) => call<{ ok: true }>(`/api/booking/venues/${id}`, { method: "DELETE" });

export const createContact = (c: ContactPayload) => call<Contact>("/api/booking/contacts", json("POST", c));
export const updateContact = (id: string, c: ContactPayload) => call<Contact>(`/api/booking/contacts/${id}`, json("PATCH", c));
export const deleteContact = (id: string) => call<{ ok: true }>(`/api/booking/contacts/${id}`, { method: "DELETE" });
