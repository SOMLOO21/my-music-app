"use client";

import Link from "next/link";
import type { Contact } from "@/booking/types";
import { card } from "./styles";

/** Un contact dans une liste, avec ses actions. */
export default function ContactCard({
  contact: c,
  showVenue = true,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  showVenue?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact sans nom";
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {name}
            {c.role && <span className="font-normal text-white/50"> · {c.role}</span>}
          </p>
          {showVenue && c.venue_id && (
            <Link href={`/booking/lieux/${c.venue_id}`} className="text-sm text-white/60 hover:underline">
              {c.venue_name}
              {c.venue_city ? ` · ${c.venue_city}` : ""}
            </Link>
          )}
          {showVenue && !c.venue_id && <p className="text-sm text-white/40">Sans lieu</p>}
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          <button type="button" onClick={onEdit} className="text-white/70 underline hover:text-white">
            Modifier
          </button>
          <button type="button" onClick={onDelete} className="text-red-400/80 underline hover:text-red-400">
            Supprimer
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        {c.email && (
          <p className="break-all">
            <a href={`mailto:${c.email}`} className="text-accent underline">
              {c.email}
            </a>
            {!c.email_valid && <span className="ml-2 text-xs text-amber-400">format à vérifier</span>}
          </p>
        )}
        {c.phone && <p className="text-white/70">{c.phone}</p>}
        {c.instagram && <p className="text-white/70">{c.instagram}</p>}
        {c.notes && <p className="whitespace-pre-line text-white/50">{c.notes}</p>}
      </div>
    </div>
  );
}
