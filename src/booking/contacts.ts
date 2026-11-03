// Booking : saisie d'un contact par l'artiste (lieu existant ou nouveau lieu privé) et copie dans la base maître.
import type { PublicUser } from "@/lib/accounts";
import { copyToMaster } from "./admin-repo";
import { venueInput } from "./inputs";
import { createPrivateVenue, findVenueByName, getVenue } from "./repo";
import type { Contact } from "./types";

export const CONTACT_ERRORS = {
  venue: "Ce lieu est introuvable.",
  duplicate: "Tu as déjà un contact avec cet e-mail.",
  empty: "Indique au moins un nom, un e-mail, un téléphone ou un Instagram.",
} as const;

/**
 * Lieu du contact : celui choisi, ou celui décrit dans `new_venue` (retrouvé par nom + ville
 * parmi les lieux visibles, sinon créé en lieu privé). Renvoie null si rien n'est indiqué.
 */
export async function resolveVenueId(userId: string, b: Record<string, unknown>): Promise<string | null | undefined> {
  const nv = b.new_venue;
  if (!nv || typeof nv !== "object") return undefined;
  const input = venueInput(nv as Record<string, unknown>);
  const name = input.name?.trim();
  if (!name) return undefined;
  const existing = await findVenueByName(userId, name, input.city ?? null);
  if (existing) return existing.id;
  return (await createPrivateVenue(userId, { ...input, name }))?.id ?? null;
}

/** Copie le contact dans la base maître (usage interne de l'équipe ; l'artiste n'y a jamais accès). */
export async function recordInMaster(user: PublicUser, contact: Contact) {
  const venue = contact.venue_id ? await getVenue(user.id, contact.venue_id) : null;
  await copyToMaster(
    [
      {
        venue_id: venue && venue.owner_user_id === null ? venue.id : null,
        venue_name: venue?.name,
        venue_type: venue?.type,
        genres: venue?.genres,
        city: venue?.city,
        department: venue?.department,
        region: venue?.region,
        first_name: contact.first_name,
        last_name: contact.last_name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        instagram: contact.instagram,
      },
    ],
    { userId: user.id, userLabel: user.pseudo, importId: null, importFilename: null },
  ).catch((e) => console.error("[booking] copie base maître :", e));
}
