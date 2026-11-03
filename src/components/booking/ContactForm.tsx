"use client";

import { useEffect, useState } from "react";
import * as api from "@/booking/api";
import type { Contact, Venue } from "@/booking/types";
import { input, label, primary, secondary } from "./styles";

const FIELDS = [
  ["first_name", "Prénom", "text"],
  ["last_name", "Nom", "text"],
  ["role", "Rôle", "text"],
  ["email", "E-mail", "email"],
  ["phone", "Téléphone", "tel"],
  ["instagram", "Instagram", "text"],
] as const;

type Form = Record<(typeof FIELDS)[number][0] | "notes", string>;

/** Ajout / modification d'un contact privé. Sans `venueId` fixé, l'artiste choisit un lieu ou en crée un. */
export default function ContactForm({
  contact,
  venueId,
  onSaved,
  onCancel,
}: {
  contact?: Contact | null;
  venueId?: string;
  onSaved: (c: Contact) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Form>({
    first_name: contact?.first_name ?? "",
    last_name: contact?.last_name ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    instagram: contact?.instagram ?? "",
    notes: contact?.notes ?? "",
  });
  const [venue, setVenue] = useState<{ id: string; name: string } | null>(
    contact?.venue_id ? { id: contact.venue_id, name: `${contact.venue_name ?? ""}${contact.venue_city ? ` (${contact.venue_city})` : ""}` } : null,
  );
  const [newVenue, setNewVenue] = useState<{ name: string; city: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: api.ContactPayload = { ...form };
    if (venueId) payload.venue_id = venueId;
    else if (newVenue?.name.trim()) payload.new_venue = newVenue;
    else payload.venue_id = venue?.id ?? null;
    try {
      onSaved(contact ? await api.updateContact(contact.id, payload) : await api.createContact(payload));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!venueId && (
        <div>
          <span className={label}>Lieu</span>
          {newVenue ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input className={input} placeholder="Nom du lieu" value={newVenue.name} onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })} required />
                <input className={input} placeholder="Ville" value={newVenue.city} onChange={(e) => setNewVenue({ ...newVenue, city: e.target.value })} />
              </div>
              <p className="text-xs text-white/50">
                S&apos;il n&apos;est pas dans l&apos;annuaire, ce lieu sera ajouté à ton espace, visible seulement par toi.{" "}
                <button type="button" className="underline" onClick={() => setNewVenue(null)}>
                  Choisir un lieu existant
                </button>
              </p>
            </div>
          ) : (
            <VenuePicker value={venue} onChange={setVenue} onCreate={(name) => setNewVenue({ name, city: "" })} />
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, text, type]) => (
          <div key={key}>
            <label className={label} htmlFor={`contact-${key}`}>
              {text}
            </label>
            <input
              id={`contact-${key}`}
              className={input}
              type={type}
              autoCapitalize={type === "email" || key === "instagram" ? "none" : undefined}
              value={form[key]}
              onChange={set(key)}
            />
          </div>
        ))}
      </div>
      <div>
        <label className={label} htmlFor="contact-notes">
          Notes (privées)
        </label>
        <textarea id="contact-notes" className={`${input} min-h-20`} value={form.notes} onChange={set("notes")} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className={`${primary} flex-1`}>
          {busy ? "Enregistrement…" : contact ? "Enregistrer" : "Ajouter le contact"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondary}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

/** Recherche d'un lieu visible (annuaire + lieux privés), ou création d'un nouveau lieu. */
function VenuePicker({
  value,
  onChange,
  onCreate,
}: {
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Venue[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      api
        .searchVenues({ q: q.trim() })
        .then((r) => setResults(r.venues.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/20 px-4 py-3">
        <span className="truncate">{value.name}</span>
        <button type="button" className="shrink-0 text-sm text-white/60 underline" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div>
      <input className={input} type="search" placeholder="Chercher un lieu (2 lettres minimum)" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <ul className="mt-1 overflow-hidden rounded-xl border border-white/10">
          {results.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm hover:bg-white/10"
                onClick={() => onChange({ id: v.id, name: `${v.name}${v.city ? ` (${v.city})` : ""}` })}
              >
                {v.name} <span className="text-white/50">{v.city}</span>
                {v.owner_user_id && <span className="ml-2 text-xs text-white/40">privé</span>}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="w-full px-4 py-2 text-left text-sm text-accent hover:bg-white/10" onClick={() => onCreate(q.trim())}>
              + Ajouter « {q.trim()} » comme nouveau lieu
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
