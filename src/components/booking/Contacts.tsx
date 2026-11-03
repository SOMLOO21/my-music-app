"use client";

import { useState } from "react";
import * as api from "@/booking/api";
import type { Contact } from "@/booking/types";
import ContactCard from "./ContactCard";
import ContactForm from "./ContactForm";
import { card, input, primary, secondary } from "./styles";

const haystack = (c: Contact) =>
  [c.first_name, c.last_name, c.email, c.venue_name, c.venue_city, c.role].filter(Boolean).join(" ").toLowerCase();

/** Mes contacts : recherche, ajout, modification, suppression, export CSV. */
export default function Contacts({ initial }: { initial: Contact[] }) {
  const [contacts, setContacts] = useState(initial);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [error, setError] = useState("");
  const shown = q.trim() ? contacts.filter((c) => haystack(c).includes(q.trim().toLowerCase())) : contacts;

  function saved(c: Contact) {
    setContacts((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
    setEditing(null);
  }

  async function remove(c: Contact) {
    if (!confirm("Supprimer ce contact de ton espace ?")) return;
    try {
      await api.deleteContact(c.id);
      setContacts((list) => list.filter((x) => x.id !== c.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing("new")} className={primary}>
          + Nouveau contact
        </button>
        {contacts.length > 0 && (
          <a href="/api/booking/contacts/export" className={secondary} download>
            Exporter en CSV
          </a>
        )}
      </div>

      {editing === "new" && (
        <div className={`${card} mb-4`}>
          <ContactForm onSaved={saved} onCancel={() => setEditing(null)} />
        </div>
      )}
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {contacts.length === 0 ? (
        editing !== "new" && (
          <p className={`${card} text-sm text-white/60`}>
            Tu n&apos;as pas encore de contact. Ajoute ceux que tu connais déjà, ou ouvre un lieu de l&apos;annuaire pour y
            noter ton contact. Ils restent privés : personne d&apos;autre ne les voit.
          </p>
        )
      ) : (
        <>
          <input className={`${input} mb-3`} type="search" placeholder="Chercher un contact ou un lieu" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="mb-2 text-xs text-white/50">
            {shown.length} contact{shown.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {shown.map((c) =>
              editing !== "new" && editing?.id === c.id ? (
                <div key={c.id} className={card}>
                  <ContactForm contact={c} onSaved={saved} onCancel={() => setEditing(null)} />
                </div>
              ) : (
                <ContactCard key={c.id} contact={c} onEdit={() => setEditing(c)} onDelete={() => remove(c)} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
