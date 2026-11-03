"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import * as api from "@/booking/api";
import type { Contact } from "@/booking/types";
import ContactCard from "./ContactCard";
import ContactForm from "./ContactForm";
import { card, primary } from "./styles";

/** Fiche lieu : mes contacts pour ce lieu (privés), ajout et modification. */
export default function VenueContacts({ venueId, initial, privateVenue }: { venueId: string; initial: Contact[]; privateVenue: boolean }) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initial);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [error, setError] = useState("");

  function saved(c: Contact) {
    setContacts((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
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

  async function removeVenue() {
    if (!confirm("Supprimer ce lieu de ton espace ? Tes contacts restent, sans lieu.")) return;
    try {
      await api.deleteVenue(venueId);
      router.push("/booking/annuaire");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Mes contacts pour ce lieu</h2>
      <p className="mb-3 text-xs text-white/50">Visibles seulement par toi.</p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {contacts.map((c) =>
          editing !== "new" && editing?.id === c.id ? (
            <div key={c.id} className={card}>
              <ContactForm contact={c} venueId={venueId} onSaved={saved} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <ContactCard key={c.id} contact={c} showVenue={false} onEdit={() => setEditing(c)} onDelete={() => remove(c)} />
          ),
        )}
      </div>

      {editing === "new" ? (
        <div className={`${card} mt-3`}>
          <ContactForm venueId={venueId} onSaved={saved} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className={`${primary} mt-3 w-full`}>
          + Ajouter mon contact pour ce lieu
        </button>
      )}

      {privateVenue && (
        <button type="button" onClick={removeVenue} className="mt-8 block w-full text-center text-sm text-red-400/80 underline">
          Supprimer ce lieu de mon espace
        </button>
      )}
    </section>
  );
}
