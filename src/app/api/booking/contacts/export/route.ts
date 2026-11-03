// Booking : export CSV des contacts de l'artiste connecté (séparateur « ; », lisible par Excel).
import { currentUser } from "@/lib/accounts";
import { listContacts } from "@/booking/repo";
import { unauthorized } from "@/booking/session";

const COLUMNS = [
  ["Lieu", "venue_name"],
  ["Ville", "venue_city"],
  ["Prénom", "first_name"],
  ["Nom", "last_name"],
  ["Rôle", "role"],
  ["E-mail", "email"],
  ["Téléphone", "phone"],
  ["Instagram", "instagram"],
  ["Notes", "notes"],
] as const;

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Guillemets si besoin ; une apostrophe neutralise les formules (=, +, -, @) à l'ouverture dans Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const contacts = await listContacts(user.id);
  const lines = [
    COLUMNS.map(([label]) => label).join(";"),
    ...contacts.map((c) => COLUMNS.map(([, key]) => cell(c[key])).join(";")),
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="mes-contacts-booking-${date}.csv"`,
    },
  });
}
