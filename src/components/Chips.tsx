"use client";

import { useState } from "react";
import { FACETS, type FacetKey, type Tags, type Taxonomy } from "@/lib/types";

export function Chip({ label, selected, onClick }: { label: string; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        selected ? "border-accent bg-accent font-medium text-black" : "border-white/20 text-white/80 hover:border-white/50"
      }`}
    >
      {label}
    </button>
  );
}

export function toggleTag(tags: Tags, facet: FacetKey, value: string): Tags {
  const current = tags[facet];
  return { ...tags, [facet]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
}

/** Sélection de tags par filtre ; `onAdd` permet de créer une nouvelle valeur. */
export function TagPicker({
  taxonomy,
  value,
  onChange,
  onAdd,
}: {
  taxonomy: Taxonomy;
  value: Tags;
  onChange: (tags: Tags) => void;
  onAdd?: (facet: FacetKey, label: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {FACETS.map((f) => (
        <div key={f.key}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{f.label}</p>
          <div className="flex flex-wrap gap-2">
            {taxonomy[f.key].map((t) => (
              <Chip key={t} label={t} selected={value[f.key].includes(t)} onClick={() => onChange(toggleTag(value, f.key, t))} />
            ))}
            {onAdd && <AddChip onAdd={(label) => onAdd(f.key, label)} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddChip({ onAdd }: { onAdd: (label: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full border border-dashed border-white/30 px-3 py-1.5 text-sm text-white/60 hover:text-white"
      >
        + Ajouter
      </button>
    );
  }

  async function submit() {
    if (label.trim()) await onAdd(label.trim());
    setLabel("");
    setEditing(false);
  }

  return (
    <input
      autoFocus
      value={label}
      onChange={(e) => setLabel(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.key === "Escape") setEditing(false);
      }}
      placeholder="Nouvelle valeur"
      className="w-36 rounded-full border border-accent bg-transparent px-3 py-1.5 text-sm outline-none"
    />
  );
}
