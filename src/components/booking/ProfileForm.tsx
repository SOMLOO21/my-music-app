"use client";

import { useState } from "react";
import * as api from "@/booking/api";
import type { Profile } from "@/booking/types";
import { input, label, primary } from "./styles";

type Field = "stage_name" | "style" | "city" | "epk_url" | "live_url" | "smartlink_url" | "signature";

const FIELDS: { key: Field; label: string; placeholder: string; type?: string }[] = [
  { key: "stage_name", label: "Nom de scène", placeholder: "Ton nom d'artiste" },
  { key: "style", label: "Style", placeholder: "Ex. rap mélodique, house, jazz manouche" },
  { key: "city", label: "Ville", placeholder: "Où tu es basé" },
  { key: "epk_url", label: "Lien EPK / dossier de presse", placeholder: "https://…", type: "url" },
  { key: "live_url", label: "Lien vidéo live", placeholder: "https://…", type: "url" },
];

/** Profil booking : alimente les variables des mails ({nom_artiste}, {style}, {lien_epk}…). */
export default function ProfileForm({
  initial,
  smartLinks,
}: {
  initial: Profile | null;
  smartLinks: { label: string; url: string }[];
}) {
  const [form, setForm] = useState({
    stage_name: initial?.stage_name ?? "",
    style: initial?.style ?? "",
    city: initial?.city ?? "",
    epk_url: initial?.epk_url ?? "",
    live_url: initial?.live_url ?? "",
    smartlink_url: initial?.smartlink_url ?? "",
    signature: initial?.signature ?? "",
    followup_days: String(initial?.followup_days ?? 10),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.saveProfile({ ...form, followup_days: Number(form.followup_days) });
      setMessage({ ok: true, text: "Profil enregistré ✓" });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-white/60">Tu remplis ces infos une fois : elles complètent automatiquement tous tes mails de démarchage.</p>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className={label} htmlFor={f.key}>
            {f.label}
          </label>
          <input id={f.key} className={input} type={f.type ?? "text"} placeholder={f.placeholder} value={form[f.key]} onChange={set(f.key)} />
        </div>
      ))}

      <div>
        <label className={label} htmlFor="smartlink_url">
          Smart link
        </label>
        {smartLinks.length > 0 && (
          <select
            className={`${input} mb-2`}
            value={smartLinks.some((l) => l.url === form.smartlink_url) ? form.smartlink_url : ""}
            onChange={set("smartlink_url")}
            aria-label="Choisir un de mes smart links"
          >
            <option value="">Choisir un de mes smart links Link…</option>
            {smartLinks.map((l) => (
              <option key={l.url} value={l.url}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <input id="smartlink_url" className={input} type="url" placeholder="https://…" value={form.smartlink_url} onChange={set("smartlink_url")} />
      </div>

      <div>
        <label className={label} htmlFor="followup_days">
          Relancer après (jours)
        </label>
        <input
          id="followup_days"
          className={input}
          type="number"
          min={1}
          max={90}
          inputMode="numeric"
          value={form.followup_days}
          onChange={set("followup_days")}
        />
      </div>

      <div>
        <label className={label} htmlFor="signature">
          Signature des mails
        </label>
        <textarea
          id="signature"
          className={`${input} min-h-28`}
          placeholder={"Ex. Léa – Booking\n06 00 00 00 00"}
          value={form.signature}
          onChange={set("signature")}
        />
      </div>

      {message && <p className={`text-sm ${message.ok ? "text-accent" : "text-red-400"}`}>{message.text}</p>}
      <button disabled={busy} className={`${primary} w-full`}>
        {busy ? "Enregistrement…" : "Enregistrer mon profil"}
      </button>
    </form>
  );
}
