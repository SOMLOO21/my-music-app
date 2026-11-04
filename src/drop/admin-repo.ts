// Drop : requêtes de l'espace admin Mymusicads (lecture seule, toutes les sorties).
// À n'appeler que depuis /admin/drop et /api/admin/drop (protégés par src/proxy.ts).
import { sql } from "@/lib/sql";
import { todayInParis } from "./engine/dates";
import { toRelease, toTask, toTrack } from "./repo";
import type { ReleaseView } from "./types";

export interface AdminReleaseRow {
  id: string;
  owner_pseudo: string;
  artist_name: string;
  title: string;
  type: string;
  release_date: string;
  mode: string;
  total: number;
  done: number;
  late: number;
  updated_at: string;
}

/** Toutes les sorties, avec progression, retards et dernière activité. */
export async function listAllReleases(today = todayInParis()): Promise<AdminReleaseRow[]> {
  const { results } = await sql
    .prepare(
      `SELECT r.id, u.pseudo AS owner_pseudo, r.artist_name, r.title, r.type, r.release_date, r.mode,
         COUNT(t.id) AS total,
         SUM(CASE WHEN t.status = 'publie' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN t.status IN ('a_produire', 'pret') AND t.due_date < ?1 THEN 1 ELSE 0 END) AS late,
         MAX(r.updated_at, COALESCE(MAX(t.updated_at), '')) AS updated_at
       FROM drop_releases r
       JOIN users u ON u.id = r.owner_id
       LEFT JOIN drop_tasks t ON t.release_id = r.id
       GROUP BY r.id
       ORDER BY updated_at DESC`,
    )
    .bind(today)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    ...(r as unknown as AdminReleaseRow),
    total: Number(r.total ?? 0),
    done: Number(r.done ?? 0),
    late: Number(r.late ?? 0),
  }));
}

/** N'importe quelle sortie, en lecture seule (rôle « viewer » côté interface). */
export async function getReleaseAsAdmin(releaseId: string): Promise<ReleaseView | null> {
  const row = await sql.prepare("SELECT * FROM drop_releases WHERE id = ?1").bind(releaseId).first<Record<string, unknown>>();
  if (!row) return null;
  const tracks = await sql.prepare("SELECT * FROM drop_tracks WHERE release_id = ?1 ORDER BY position").bind(releaseId).all<Record<string, unknown>>();
  const tasks = await sql
    .prepare("SELECT * FROM drop_tasks WHERE release_id = ?1 ORDER BY due_date, position")
    .bind(releaseId)
    .all<Record<string, unknown>>();
  return { role: "viewer", release: toRelease(row), tracks: tracks.results.map(toTrack), tasks: tasks.results.map(toTask) };
}
