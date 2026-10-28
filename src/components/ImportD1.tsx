"use client";
// TEMPORAIRE : import, depuis le navigateur, de l'export de l'ancienne base Cloudflare D1.
// Envoie le fichier par paquets à /api/admin/import. À supprimer une fois l'import fait.

import { useState } from "react";

const TABLES = ["taxonomy", "videos", "users", "sessions", "favorites", "thumbnails"];
const MAX_BATCH = 3_000_000;

export default function ImportD1() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    setStatus("Lecture du fichier…");
    const statements = (await file.text())
      .split("\n")
      .filter((l) => TABLES.some((t) => l.startsWith(`INSERT INTO "${t}"`)))
      .map((l) => l.replace(/^INSERT INTO/, "INSERT OR REPLACE INTO"));
    if (statements.length === 0) {
      setStatus("Ce fichier ne contient pas de données à importer.");
      setBusy(false);
      return;
    }

    let batch: string[] = [];
    let size = 0;
    let sent = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statements: batch }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status} : ${(await res.text()).slice(0, 120)}`);
      sent += batch.length;
      setStatus(`${sent} / ${statements.length} lignes importées…`);
      batch = [];
      size = 0;
    };
    try {
      for (const s of statements) {
        if (size + s.length > MAX_BATCH) await flush();
        batch.push(s);
        size += s.length;
      }
      await flush();
      setStatus(`Import terminé ✓ ${sent} lignes. Recharge la page pour voir la bibliothèque.`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) importFile(file);
        }}
        className={`rounded-2xl border-2 border-dashed p-5 text-center ${dragging ? "border-accent bg-accent/10" : "border-white/20"}`}
      >
        <p className="font-semibold">Importer les anciennes données (Cloudflare)</p>
        <p className="mt-1 text-sm text-white/60">Glisse ici le fichier « d1-export.sql », ou choisis-le :</p>
        <input
          type="file"
          accept=".sql"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
          className="mx-auto mt-3 block text-sm"
        />
        {status && <p className="mt-3 text-sm text-accent">{status}</p>}
      </div>
    </section>
  );
}
