// Drop : toutes les requêtes côté artiste, avec le contrôle des droits (équivalent des politiques RLS).
// Règles :
// - chaque fonction prend userId (celui de currentUser(), jamais une valeur envoyée par le navigateur) ;
// - propriétaire : tous les droits ; éditeur : modifie et ajoute des tâches ; lecteur : lit seulement ;
// - seul le propriétaire supprime une sortie ou une tâche, change la sortie (date, plateformes…) et gère le partage ;
// - une sortie ou une tâche sans droit d'accès est traitée comme inexistante (null / false → 404).
// Les entrées doivent déjà être validées par src/drop/inputs.ts.
import { sql } from "@/lib/sql";
import { CONFIG_VERSION, DROP_CONFIG, phaseFor } from "./config/index";
import { addDays, diffDays, todayInParis } from "./engine/dates";
import { generatePlan, proposeSingleDates } from "./engine/generate";
import { reschedule } from "./engine/reschedule";
import type { PlanInput, PlannedTask } from "./engine/types";
import type { ReleaseCreate, SettingsChange, TaskCreate, TaskPatch } from "./inputs";
import type {
  Member,
  MemberRole,
  PublicRelease,
  PublicTask,
  Release,
  ReleaseSummary,
  ReleaseView,
  Role,
  ShareLink,
  Task,
  Track,
} from "./types";

const db = () => sql;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID().replace(/-/g, "");
type Row = Record<string, unknown>;
type Statement = ReturnType<typeof sql.prepare>;

const parseJson = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const bool = (v: unknown) => v === 1 || v === true || v === "1";

export const toRelease = (r: Row): Release =>
  ({
    ...r,
    clip_is_relaunch: bool(r.clip_is_relaunch),
    admin_enabled: bool(r.admin_enabled),
    platforms: parseJson(r.platforms, []),
    owned_assets: parseJson(r.owned_assets, []),
    asset_quantities: parseJson(r.asset_quantities, {}),
    warnings: parseJson(r.warnings, []),
    dismissed_keys: parseJson(r.dismissed_keys, []),
  }) as unknown as Release;

export const toTrack = (r: Row): Track =>
  ({ ...r, position: Number(r.position), is_focus_single: bool(r.is_focus_single), has_clip: bool(r.has_clip) }) as Track;

export const toTask = (r: Row): Task =>
  ({
    ...r,
    platforms: parseJson(r.platforms, []),
    formats: parseJson(r.formats, []),
    how: parseJson(r.how, []),
    ideas: parseJson(r.ideas, []),
    checklist: parseJson(r.checklist, []),
    date_locked: bool(r.date_locked),
    position: Number(r.position),
    offset_days: r.offset_days == null ? null : Number(r.offset_days),
  }) as unknown as Task;

// --- Droits --------------------------------------------------------------------------

const CAN = {
  read: ["owner", "editor", "viewer"],
  editTasks: ["owner", "editor"],
  owner: ["owner"],
} as const satisfies Record<string, readonly Role[]>;
type Right = keyof typeof CAN;

/** Rôle du compte sur la sortie, ou null s'il n'y a pas accès. */
export async function roleOn(userId: string, releaseId: string): Promise<Role | null> {
  const r = await db()
    .prepare(
      `SELECT r.owner_id, m.role FROM drop_releases r
       LEFT JOIN drop_members m ON m.release_id = r.id AND m.user_id = ?2
       WHERE r.id = ?1`,
    )
    .bind(releaseId, userId)
    .first<{ owner_id: string; role: MemberRole | null }>();
  if (!r) return null;
  if (r.owner_id === userId) return "owner";
  return r.role ?? null;
}

const allowed = (role: Role | null, right: Right) => role !== null && (CAN[right] as readonly Role[]).includes(role);

async function releaseIf(userId: string, releaseId: string, right: Right) {
  const role = await roleOn(userId, releaseId);
  if (!allowed(role, right)) return null;
  const row = await db().prepare("SELECT * FROM drop_releases WHERE id = ?1").bind(releaseId).first<Row>();
  return row ? { role: role!, release: toRelease(row) } : null;
}

async function taskIf(userId: string, taskId: string, right: Right) {
  const row = await db().prepare("SELECT * FROM drop_tasks WHERE id = ?1").bind(taskId).first<Row>();
  if (!row) return null;
  const task = toTask(row);
  return allowed(await roleOn(userId, task.release_id), right) ? task : null;
}

// --- Moteur ↔ base ------------------------------------------------------------------------

async function tracksOf(releaseId: string) {
  const { results } = await db().prepare("SELECT * FROM drop_tracks WHERE release_id = ?1 ORDER BY position").bind(releaseId).all<Row>();
  return results.map(toTrack);
}

async function tasksOf(releaseId: string) {
  const { results } = await db()
    .prepare("SELECT * FROM drop_tasks WHERE release_id = ?1 ORDER BY due_date, position, created_at")
    .bind(releaseId)
    .all<Row>();
  return results.map(toTask);
}

function planInput(release: Release, tracks: Track[]): PlanInput {
  return {
    type: release.type,
    releaseDate: release.release_date,
    platforms: release.platforms,
    ownedAssets: release.owned_assets,
    adminEnabled: release.admin_enabled,
    clipIsRelaunch: release.clip_is_relaunch,
    tracks: tracks.map((t) => ({
      key: t.id,
      title: t.title,
      isSingle: t.is_focus_single,
      singleReleaseDate: t.single_release_date,
      hasClip: t.has_clip,
      clipReleaseDate: t.clip_release_date,
    })),
  };
}

function insertTask(releaseId: string, t: PlannedTask, position: number, at: string): Statement {
  return db()
    .prepare(
      `INSERT INTO drop_tasks (id, release_id, track_id, plan_key, template_task_id, title, phase, module, priority, platforms,
         formats, status, due_date, offset_days, date_locked, why, how, ideas, checklist, alert, position, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)`,
    )
    .bind(
      newId(),
      releaseId,
      t.trackKey,
      t.key,
      t.templateTaskId,
      t.title,
      t.phase,
      t.module,
      t.priority,
      JSON.stringify(t.platforms),
      JSON.stringify(t.formats),
      t.status,
      t.dueDate,
      t.offsetDays,
      t.why,
      JSON.stringify(t.how),
      JSON.stringify([t.idea]),
      JSON.stringify(t.how.map((label) => ({ label, done: false }))),
      t.alert,
      position,
      at,
    );
}

// --- Sorties ---------------------------------------------------------------------------

/** Crée la sortie, ses titres et son planning en une fois. */
export async function createRelease(userId: string, input: ReleaseCreate, today = todayInParis()) {
  const id = newId();
  const at = now();
  const project = input.type === "ep" || input.type === "album";

  // Dates proposées pour les singles extraits sans date.
  const singles = input.tracks.filter((t) => t.isSingle);
  const proposed = proposeSingleDates(DROP_CONFIG, input.releaseDate, singles.length);
  const tracks: Track[] = project
    ? input.tracks.map((t, i) => ({
        id: newId(),
        release_id: id,
        position: i + 1,
        title: t.title,
        is_focus_single: t.isSingle,
        single_release_date: t.isSingle ? (t.singleReleaseDate ?? proposed[singles.indexOf(t)]) : null,
        has_clip: t.hasClip,
        clip_release_date: t.hasClip ? t.clipReleaseDate : null,
      }))
    : [];

  const release: Release = {
    id,
    owner_id: userId,
    type: input.type,
    title: input.title,
    artist_name: input.artistName,
    release_date: input.releaseDate,
    clip_is_relaunch: input.type === "clip" && input.clipIsRelaunch,
    platforms: input.platforms,
    owned_assets: input.ownedAssets,
    asset_quantities: input.assetQuantities,
    admin_enabled: input.adminEnabled,
    mode: "standard",
    warnings: [],
    dismissed_keys: [],
    config_version: CONFIG_VERSION,
    created_at: at,
    updated_at: at,
  };
  const plan = generatePlan(planInput(release, tracks), DROP_CONFIG, today);
  release.mode = plan.mode;
  release.warnings = plan.warnings;

  await db().batch([
    db()
      .prepare(
        `INSERT INTO drop_releases (id, owner_id, type, title, artist_name, release_date, clip_is_relaunch, platforms, owned_assets,
           asset_quantities, admin_enabled, mode, warnings, dismissed_keys, config_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?15, ?10, ?11, ?12, '[]', ?13, ?14, ?14)`,
      )
      .bind(
        id,
        userId,
        release.type,
        release.title,
        release.artist_name,
        release.release_date,
        release.clip_is_relaunch ? 1 : 0,
        JSON.stringify(release.platforms),
        JSON.stringify(release.owned_assets),
        release.admin_enabled ? 1 : 0,
        release.mode,
        JSON.stringify(release.warnings),
        CONFIG_VERSION,
        at,
        JSON.stringify(release.asset_quantities),
      ),
    ...tracks.map((t) =>
      db()
        .prepare(
          `INSERT INTO drop_tracks (id, release_id, position, title, is_focus_single, single_release_date, has_clip, clip_release_date)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(t.id, id, t.position, t.title, t.is_focus_single ? 1 : 0, t.single_release_date, t.has_clip ? 1 : 0, t.clip_release_date),
    ),
    ...plan.tasks.map((t, i) => insertTask(id, t, i, at)),
  ]);
  return { release, tracks, plan };
}

const SUMMARY = `
  SELECT r.id, r.type, r.title, r.artist_name, r.release_date, r.mode,
    (SELECT COUNT(*) FROM drop_tasks t WHERE t.release_id = r.id) AS total,
    (SELECT COUNT(*) FROM drop_tasks t WHERE t.release_id = r.id AND t.status = 'publie') AS done,
    (SELECT COUNT(*) FROM drop_tasks t WHERE t.release_id = r.id AND t.status IN ('a_produire', 'pret') AND t.due_date < ?2) AS late,
    (SELECT t.title || char(31) || t.due_date FROM drop_tasks t WHERE t.release_id = r.id AND t.status <> 'publie'
      ORDER BY t.due_date, t.position LIMIT 1) AS next_task`;

const toSummary = (r: Row, role: Role): ReleaseSummary => {
  const next = typeof r.next_task === "string" ? r.next_task.split("\u001f") : null;
  return {
    id: String(r.id),
    type: r.type as ReleaseSummary["type"],
    title: String(r.title),
    artist_name: String(r.artist_name),
    release_date: String(r.release_date),
    mode: r.mode as ReleaseSummary["mode"],
    role,
    total: Number(r.total),
    done: Number(r.done),
    late: Number(r.late),
    next_task: next ? { title: next[0], due_date: next[1] } : null,
  };
};

/** Accueil /drop : mes sorties et celles partagées avec moi. */
export async function listReleases(userId: string, today = todayInParis()) {
  const mine = await db()
    .prepare(`${SUMMARY} FROM drop_releases r WHERE r.owner_id = ?1 ORDER BY r.release_date DESC, r.created_at DESC`)
    .bind(userId, today)
    .all<Row>();
  const shared = await db()
    .prepare(
      `${SUMMARY}, m.role AS member_role FROM drop_releases r JOIN drop_members m ON m.release_id = r.id
       WHERE m.user_id = ?1 AND r.owner_id <> ?1 ORDER BY r.release_date DESC`,
    )
    .bind(userId, today)
    .all<Row>();
  return {
    mine: mine.results.map((r) => toSummary(r, "owner")),
    shared: shared.results.map((r) => toSummary(r, r.member_role as Role)),
  };
}

/** Une sortie complète, si le compte y a accès. */
export async function getRelease(userId: string, releaseId: string): Promise<ReleaseView | null> {
  const found = await releaseIf(userId, releaseId, "read");
  if (!found) return null;
  return { role: found.role, release: found.release, tracks: await tracksOf(releaseId), tasks: await tasksOf(releaseId) };
}

export async function deleteRelease(userId: string, releaseId: string) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return false;
  await db().batch(
    ["drop_tasks", "drop_tracks", "drop_members", "drop_share_links"]
      .map((table) => db().prepare(`DELETE FROM ${table} WHERE release_id = ?1`).bind(releaseId))
      .concat(db().prepare("DELETE FROM drop_releases WHERE id = ?1").bind(releaseId)),
  );
  return true;
}

/** Nouvelle sortie avec la même structure (planning recalculé à partir d'aujourd'hui). */
export async function duplicateRelease(userId: string, releaseId: string, today = todayInParis()) {
  const view = await getRelease(userId, releaseId);
  if (!view || view.role !== "owner") return null;
  const r = view.release;
  return createRelease(
    userId,
    {
      type: r.type,
      title: `${r.title} (copie)`.slice(0, 120),
      artistName: r.artist_name,
      releaseDate: r.release_date,
      clipIsRelaunch: r.clip_is_relaunch,
      platforms: r.platforms,
      ownedAssets: r.owned_assets,
      assetQuantities: r.asset_quantities,
      adminEnabled: r.admin_enabled,
      tracks: view.tracks.map((t) => ({
        title: t.title,
        isSingle: t.is_focus_single,
        singleReleaseDate: t.single_release_date,
        hasClip: t.has_clip,
        clipReleaseDate: t.clip_release_date,
      })),
    },
    today,
  );
}

// --- Paramètres et recalage ------------------------------------------------------------

/** Sortie et titres après les changements demandés (sans rien enregistrer). */
function applyChanges(release: Release, tracks: Track[], change: SettingsChange) {
  const next: Release = {
    ...release,
    release_date: change.releaseDate ?? release.release_date,
    platforms: change.platforms ?? release.platforms,
    owned_assets: change.ownedAssets ?? release.owned_assets,
    asset_quantities: change.assetQuantities ?? release.asset_quantities,
    admin_enabled: change.adminEnabled ?? release.admin_enabled,
  };
  // EP/album : les singles et clips suivent le décalage de la date du projet.
  const shift = diffDays(release.release_date, next.release_date);
  const move = (d: string | null) => (d && shift ? addDays(d, shift) : d);
  const nextTracks = tracks.map((t) => ({ ...t, single_release_date: move(t.single_release_date), clip_release_date: move(t.clip_release_date) }));
  return { next, nextTracks };
}

async function prepareReschedule(userId: string, releaseId: string, change: SettingsChange, today: string) {
  const found = await releaseIf(userId, releaseId, "owner");
  if (!found) return null;
  const tracks = await tracksOf(releaseId);
  const tasks = await tasksOf(releaseId);
  const { next, nextTracks } = applyChanges(found.release, tracks, change);
  const preview = reschedule(
    tasks.map((t) => ({ id: t.id, key: t.plan_key, status: t.status, dueDate: t.due_date, dateLocked: t.date_locked })),
    planInput(next, nextTracks),
    DROP_CONFIG,
    today,
    { includeLocked: change.includeLocked, dismissedKeys: found.release.dismissed_keys },
  );
  return { release: found.release, next, tracks, nextTracks, tasks, preview };
}

/** Aperçu avant d'appliquer : « 12 tâches déplacées, 2 ajoutées, 1 retirée ». */
export async function previewSettings(userId: string, releaseId: string, change: SettingsChange, today = todayInParis()) {
  const p = await prepareReschedule(userId, releaseId, change, today);
  if (!p) return null;
  const titles = new Map(p.tasks.map((t) => [t.id, t.title]));
  return {
    summary: p.preview.summary,
    mode: p.preview.plan.mode,
    warnings: p.preview.plan.warnings,
    lockedSkipped: p.preview.lockedSkipped,
    moves: p.preview.moves.map((m) => ({ ...m, title: titles.get(m.id) ?? "" })),
    additions: p.preview.additions.map((a) => ({ key: a.key, title: a.title, dueDate: a.dueDate })),
    removals: p.preview.removals.map((r) => ({ ...r, title: titles.get(r.id) ?? "" })),
  };
}

/** Applique les changements de paramètres et le recalage. Statuts, notes et liens ne bougent jamais. */
export async function applySettings(userId: string, releaseId: string, change: SettingsChange, today = todayInParis()) {
  const p = await prepareReschedule(userId, releaseId, change, today);
  if (!p) return null;
  const at = now();
  const { plan } = p.preview;
  const planned = new Map(plan.tasks.map((t) => [t.key, t]));
  const maxPosition = Math.max(0, ...p.tasks.map((t) => t.position));

  const statements: Statement[] = [
    db()
      .prepare(
        `UPDATE drop_releases SET release_date = ?2, platforms = ?3, owned_assets = ?4, admin_enabled = ?5, mode = ?6,
           warnings = ?7, config_version = ?8, updated_at = ?9, asset_quantities = ?10 WHERE id = ?1`,
      )
      .bind(
        releaseId,
        p.next.release_date,
        JSON.stringify(p.next.platforms),
        JSON.stringify(p.next.owned_assets),
        p.next.admin_enabled ? 1 : 0,
        plan.mode,
        JSON.stringify(plan.warnings),
        CONFIG_VERSION,
        at,
        JSON.stringify(p.next.asset_quantities),
      ),
    ...p.nextTracks.map((t) =>
      db()
        .prepare("UPDATE drop_tracks SET single_release_date = ?2, clip_release_date = ?3 WHERE id = ?1")
        .bind(t.id, t.single_release_date, t.clip_release_date),
    ),
    ...p.preview.moves.map((m) =>
      db()
        .prepare("UPDATE drop_tasks SET due_date = ?2, offset_days = ?3, date_locked = 0, updated_at = ?4 WHERE id = ?1")
        .bind(m.id, m.to, planned.get(m.key)!.offsetDays, at),
    ),
    ...p.preview.removals.map((r) => db().prepare("DELETE FROM drop_tasks WHERE id = ?1").bind(r.id)),
    ...p.preview.additions.map((t, i) => insertTask(releaseId, t, maxPosition + 1 + i, at)),
  ];
  // Plateformes des tâches gardées : seulement celles encore cochées.
  for (const t of p.tasks) {
    const target = t.plan_key ? planned.get(t.plan_key) : null;
    if (target && JSON.stringify(target.platforms) !== JSON.stringify(t.platforms)) {
      statements.push(db().prepare("UPDATE drop_tasks SET platforms = ?2 WHERE id = ?1").bind(t.id, JSON.stringify(target.platforms)));
    }
  }
  await db().batch(statements);
  return { summary: p.preview.summary, mode: plan.mode };
}

// --- Tâches ------------------------------------------------------------------------------

export async function updateTask(userId: string, taskId: string, patch: TaskPatch) {
  const task = await taskIf(userId, taskId, "editTasks");
  if (!task) return null;
  const sets: string[] = [];
  const args: unknown[] = [taskId];
  const set = (col: string, value: unknown) => {
    args.push(value);
    sets.push(`${col} = ?${args.length}`);
  };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.status !== undefined) {
    set("status", patch.status);
    set("completed_at", patch.status === "publie" ? (task.completed_at ?? now()) : null);
  }
  if (patch.dueDate !== undefined && patch.dueDate !== task.due_date) {
    set("due_date", patch.dueDate);
    set("date_locked", 1);
    // Le J (J-7…) suit la nouvelle date, par rapport à la même sortie de référence.
    if (task.offset_days !== null) set("offset_days", task.offset_days + diffDays(task.due_date, patch.dueDate));
  }
  if (patch.notes !== undefined) set("notes", patch.notes);
  if (patch.linkUrl !== undefined) set("link_url", patch.linkUrl);
  if (patch.checklist !== undefined) set("checklist", JSON.stringify(patch.checklist));
  if (patch.module !== undefined) set("module", patch.module);
  if (patch.platforms !== undefined) set("platforms", JSON.stringify(patch.platforms));
  if (patch.position !== undefined) set("position", patch.position);
  set("updated_at", now());
  await db().prepare(`UPDATE drop_tasks SET ${sets.join(", ")} WHERE id = ?1`).bind(...args).run();
  await touch(task.release_id);
  return toTask((await db().prepare("SELECT * FROM drop_tasks WHERE id = ?1").bind(taskId).first<Row>())!);
}

/** Tâche personnalisée ajoutée par l'artiste (ou un éditeur). */
export async function createTask(userId: string, releaseId: string, input: TaskCreate) {
  const found = await releaseIf(userId, releaseId, "editTasks");
  if (!found) return null;
  if (input.trackId) {
    const track = await db().prepare("SELECT 1 FROM drop_tracks WHERE id = ?1 AND release_id = ?2").bind(input.trackId, releaseId).first();
    if (!track) return null;
  }
  const at = now();
  const id = newId();
  const offset = diffDays(found.release.release_date, input.dueDate);
  const max = await db().prepare("SELECT MAX(position) AS p FROM drop_tasks WHERE release_id = ?1").bind(releaseId).first<{ p: number | null }>();
  await db()
    .prepare(
      `INSERT INTO drop_tasks (id, release_id, track_id, plan_key, template_task_id, title, phase, module, priority, platforms, formats,
         status, due_date, offset_days, date_locked, notes, position, created_at, updated_at)
       VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5, ?6, 'recommandee', ?7, '[]', 'a_produire', ?8, ?9, 1, ?10, ?11, ?12, ?12)`,
    )
    .bind(
      id,
      releaseId,
      input.trackId,
      input.title,
      phaseFor(DROP_CONFIG, offset),
      input.module,
      JSON.stringify(input.platforms),
      input.dueDate,
      offset,
      input.notes,
      (max?.p ?? 0) + 1,
      at,
    )
    .run();
  await touch(releaseId);
  return toTask((await db().prepare("SELECT * FROM drop_tasks WHERE id = ?1").bind(id).first<Row>())!);
}

export async function duplicateTask(userId: string, taskId: string) {
  const task = await taskIf(userId, taskId, "editTasks");
  if (!task) return null;
  const id = newId();
  const at = now();
  await db()
    .prepare(
      `INSERT INTO drop_tasks (id, release_id, track_id, plan_key, template_task_id, title, phase, module, priority, platforms, formats,
         status, due_date, offset_days, date_locked, why, how, ideas, checklist, notes, link_url, position, created_at, updated_at)
       SELECT ?2, release_id, track_id, NULL, NULL, substr(title || ' (copie)', 1, 200), phase, module, priority, platforms, formats,
         'a_produire', due_date, offset_days, 1, why, how, ideas,
         (SELECT COALESCE(json_group_array(json_object('label', json_extract(value, '$.label'), 'done', json('false'))), '[]')
            FROM json_each(drop_tasks.checklist)),
         notes, link_url, position + 1, ?3, ?3
       FROM drop_tasks WHERE id = ?1`,
    )
    .bind(taskId, id, at)
    .run();
  await touch(task.release_id);
  return toTask((await db().prepare("SELECT * FROM drop_tasks WHERE id = ?1").bind(id).first<Row>())!);
}

/** Suppression (propriétaire) : une tâche générée supprimée n'est plus jamais recréée par un recalage. */
export async function deleteTask(userId: string, taskId: string) {
  const task = await taskIf(userId, taskId, "owner");
  if (!task) return false;
  const statements = [db().prepare("DELETE FROM drop_tasks WHERE id = ?1").bind(taskId)];
  if (task.plan_key) {
    statements.push(
      db()
        .prepare(
          `UPDATE drop_releases SET dismissed_keys = (
             SELECT json_group_array(value) FROM (SELECT value FROM json_each(dismissed_keys) UNION SELECT ?2)
           ), updated_at = ?3 WHERE id = ?1`,
        )
        .bind(task.release_id, task.plan_key, now()),
    );
  }
  await db().batch(statements);
  return true;
}

const touch = (releaseId: string) => db().prepare("UPDATE drop_releases SET updated_at = ?2 WHERE id = ?1").bind(releaseId, now()).run();

// --- Partage : lien public -----------------------------------------------------------------

const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function getShareLink(userId: string, releaseId: string): Promise<ShareLink | null | false> {
  if (!(await releaseIf(userId, releaseId, "owner"))) return false;
  return db()
    .prepare("SELECT id, token, created_at FROM drop_share_links WHERE release_id = ?1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1")
    .bind(releaseId)
    .first<ShareLink>();
}

/** Crée un lien (ou le régénère : l'ancien cesse de fonctionner). */
export async function createShareLink(userId: string, releaseId: string) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return null;
  const link: ShareLink = { id: newId(), token: newToken(), created_at: now() };
  await db().batch([
    db().prepare("UPDATE drop_share_links SET is_active = 0, revoked_at = ?2 WHERE release_id = ?1 AND is_active = 1").bind(releaseId, link.created_at),
    db()
      .prepare("INSERT INTO drop_share_links (id, release_id, token, is_active, created_at) VALUES (?1, ?2, ?3, 1, ?4)")
      .bind(link.id, releaseId, link.token, link.created_at),
  ]);
  return link;
}

export async function disableShareLink(userId: string, releaseId: string) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return false;
  await db().prepare("UPDATE drop_share_links SET is_active = 0, revoked_at = ?2 WHERE release_id = ?1 AND is_active = 1").bind(releaseId, now()).run();
  return true;
}

const PUBLIC_TASK_COLUMNS =
  "id, track_id, template_task_id, title, phase, module, priority, platforms, formats, status, due_date, offset_days, date_locked, why, how, ideas, alert, position, completed_at, created_at, updated_at";

const toPublicTask = (r: Row): PublicTask => {
  const { notes, link_url, checklist, release_id, plan_key, ...rest } = toTask(r);
  void [notes, link_url, checklist, release_id, plan_key];
  return rest;
};

/** Page publique : seulement si le lien est actif, et sans notes ni liens. */
export async function getPublicRelease(token: string): Promise<PublicRelease | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await db()
    .prepare(
      `SELECT r.* FROM drop_share_links s JOIN drop_releases r ON r.id = s.release_id WHERE s.token = ?1 AND s.is_active = 1`,
    )
    .bind(token)
    .first<Row>();
  if (!r) return null;
  const release = toRelease(r);
  const tracks = await tracksOf(release.id);
  const { results } = await db()
    .prepare(`SELECT ${PUBLIC_TASK_COLUMNS} FROM drop_tasks WHERE release_id = ?1 ORDER BY due_date, position`)
    .bind(release.id)
    .all<Row>();
  return {
    release: {
      type: release.type,
      title: release.title,
      artist_name: release.artist_name,
      release_date: release.release_date,
      mode: release.mode,
      platforms: release.platforms,
    },
    tracks: tracks.map(({ id, position, title, is_focus_single, single_release_date, has_clip }) => ({
      id,
      position,
      title,
      is_focus_single,
      single_release_date,
      has_clip,
    })),
    // Seules les colonnes de PUBLIC_TASK_COLUMNS sont lues : notes, liens et sous-étapes ne quittent jamais la base.
    tasks: results.map(toPublicTask),
  };
}

// --- Partage : comptes invités ---------------------------------------------------------------

export async function listMembers(userId: string, releaseId: string): Promise<Member[] | null> {
  if (!(await releaseIf(userId, releaseId, "owner"))) return null;
  const { results } = await db()
    .prepare(
      `SELECT m.user_id, u.pseudo, u.first_name, u.last_name, m.role, m.created_at
       FROM drop_members m JOIN users u ON u.id = m.user_id WHERE m.release_id = ?1 ORDER BY m.created_at`,
    )
    .bind(releaseId)
    .all<Member>();
  return results;
}

/** Invite un compte My Music App existant, par son pseudo. */
export async function inviteMember(userId: string, releaseId: string, pseudo: string, role: MemberRole) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return null;
  const user = await db().prepare("SELECT id FROM users WHERE pseudo = ?1 COLLATE NOCASE").bind(pseudo).first<{ id: string }>();
  if (!user) return { error: "not_found" } as const;
  if (user.id === userId) return { error: "self" } as const;
  await db()
    .prepare(
      `INSERT INTO drop_members (release_id, user_id, role, invited_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (release_id, user_id) DO UPDATE SET role = excluded.role`,
    )
    .bind(releaseId, user.id, role, userId, now())
    .run();
  return { members: (await listMembers(userId, releaseId))! } as const;
}

export async function setMemberRole(userId: string, releaseId: string, memberId: string, role: MemberRole) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return false;
  await db().prepare("UPDATE drop_members SET role = ?3 WHERE release_id = ?1 AND user_id = ?2").bind(releaseId, memberId, role).run();
  return true;
}

export async function removeMember(userId: string, releaseId: string, memberId: string) {
  if (!(await releaseIf(userId, releaseId, "owner"))) return false;
  await db().prepare("DELETE FROM drop_members WHERE release_id = ?1 AND user_id = ?2").bind(releaseId, memberId).run();
  return true;
}
