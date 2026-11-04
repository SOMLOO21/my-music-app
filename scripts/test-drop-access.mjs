// Drop : test des droits d'accès et de l'enregistrement (npm run test:drop).
// Sur une base locale neuve (file:test-drop.db) : un propriétaire, un éditeur, un lecteur et un inconnu.
// Vérifie que chaque fonction de src/drop/repo.ts applique les droits de la spec (section 6 et 7).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { before, describe, test } from "node:test";

const DB_FILE = "test-drop.db";
for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
delete process.env.TURSO_AUTH_TOKEN;
execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env, stdio: "ignore" });

const { sql } = await import("../src/lib/sql.ts");
const repo = await import("../src/drop/repo.ts");
const admin = await import("../src/drop/admin-repo.ts");
const { releaseCreateSchema, taskPatchSchema, inviteSchema } = await import("../src/drop/inputs.ts");

const TODAY = "2026-11-04";

async function createUser(pseudo) {
  const id = crypto.randomUUID();
  await sql
    .prepare("INSERT INTO users (id, pseudo, first_name, last_name, password_hash, salt, created_at) VALUES (?1, ?2, ?3, 'Test', 'x', 'x', ?4)")
    .bind(id, pseudo, pseudo, new Date().toISOString())
    .run();
  return id;
}

const singleInput = (title) =>
  releaseCreateSchema.parse({
    type: "single",
    title,
    artistName: "Artiste Démo",
    releaseDate: "2026-12-04",
    platforms: ["tiktok", "instagram"],
    ownedAssets: ["cover"],
    adminEnabled: true,
  });

let OWNER, EDITOR, VIEWER, STRANGER, release, task, other;

before(async () => {
  OWNER = await createUser("proprio");
  EDITOR = await createUser("manager");
  VIEWER = await createUser("lecteur");
  STRANGER = await createUser("inconnu");
  release = (await repo.createRelease(OWNER, singleInput("Mon single"), TODAY)).release;
  other = (await repo.createRelease(STRANGER, singleInput("Single de l'inconnu"), TODAY)).release;
  assert.ok("members" in (await repo.inviteMember(OWNER, release.id, "MANAGER", "editor")));
  assert.ok("members" in (await repo.inviteMember(OWNER, release.id, "lecteur", "viewer")));
  task = (await repo.getRelease(OWNER, release.id)).tasks.find((t) => t.plan_key === "single_teaser_1");
});

describe("Création et lecture", () => {
  test("la sortie est enregistrée avec son planning", async () => {
    const view = await repo.getRelease(OWNER, release.id);
    assert.equal(view.role, "owner");
    assert.equal(view.release.mode, "standard");
    assert.equal(view.release.config_version, "2026-11-v1");
    assert.ok(view.tasks.length > 15);
    const cover = view.tasks.find((t) => t.plan_key === "single_master_cover");
    assert.equal(cover.status, "pret", "contenu déjà disponible");
    assert.deepEqual(cover.ideas, ["Master validé, cover 3000 × 3000 px sans texte superflu."]);
    assert.ok(cover.checklist.length > 0 && cover.checklist.every((c) => c.done === false));
    assert.ok(view.tasks.every((t) => t.platforms.every((p) => p !== "youtube")));
  });

  test("EP : titres enregistrés, dates des singles proposées", async () => {
    const input = releaseCreateSchema.parse({
      type: "ep",
      title: "Mon EP",
      artistName: "Artiste Démo",
      releaseDate: "2027-03-03",
      platforms: ["tiktok"],
      tracks: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `Titre ${i}`, isSingle: i <= 2, hasClip: i === 2 })),
    });
    const { release: ep } = await repo.createRelease(OWNER, input, TODAY);
    const view = await repo.getRelease(OWNER, ep.id);
    assert.equal(view.tracks.length, 6);
    assert.deepEqual(view.tracks.filter((t) => t.is_focus_single).map((t) => t.single_release_date), ["2027-01-13", "2027-02-10"]);
    assert.ok(view.tasks.some((t) => t.track_id === view.tracks[1].id && t.template_task_id === "clip_release"));
  });

  test("chacun voit ses sorties et celles partagées avec lui", async () => {
    const owner = await repo.listReleases(OWNER, TODAY);
    assert.ok(owner.mine.some((r) => r.id === release.id));
    assert.equal(owner.shared.length, 0);
    const editor = await repo.listReleases(EDITOR, TODAY);
    assert.deepEqual(editor.mine, []);
    assert.deepEqual(editor.shared.map((r) => [r.id, r.role]), [[release.id, "editor"]]);
    assert.ok(editor.shared[0].total > 0 && editor.shared[0].next_task);
    const stranger = await repo.listReleases(STRANGER, TODAY);
    assert.ok(!stranger.mine.concat(stranger.shared).some((r) => r.id === release.id));
  });

  test("un inconnu ne voit rien", async () => {
    assert.equal(await repo.getRelease(STRANGER, release.id), null);
    assert.equal(await repo.getRelease(OWNER, other.id), null);
    assert.equal(await repo.roleOn(STRANGER, release.id), null);
  });
});

describe("Droits sur les tâches", () => {
  test("lecteur : aucune modification", async () => {
    assert.equal(await repo.updateTask(VIEWER, task.id, { status: "publie" }), null);
    assert.equal(await repo.createTask(VIEWER, release.id, { title: "X", dueDate: "2026-11-20", module: "promo", platforms: [], notes: null, trackId: null }), null);
    assert.equal(await repo.duplicateTask(VIEWER, task.id), null);
    assert.equal(await repo.deleteTask(VIEWER, task.id), false);
  });

  test("éditeur : statut, date (verrouillée), notes, ajout de tâche", async () => {
    const updated = await repo.updateTask(EDITOR, task.id, { status: "programme", dueDate: "2026-11-21", notes: "Tourné samedi" });
    assert.equal(updated.status, "programme");
    assert.equal(updated.due_date, "2026-11-21");
    assert.equal(updated.date_locked, true);
    assert.equal(updated.notes, "Tourné samedi");
    const custom = await repo.createTask(EDITOR, release.id, {
      title: "Réserver le studio photo",
      dueDate: "2026-11-15",
      module: "production",
      platforms: [],
      notes: null,
      trackId: null,
    });
    assert.equal(custom.plan_key, null);
    assert.equal(custom.date_locked, true);
    assert.equal(custom.phase, "annoncer");
  });

  test("éditeur : ni suppression de tâche ou de sortie, ni changement de date de sortie, ni partage", async () => {
    assert.equal(await repo.deleteTask(EDITOR, task.id), false);
    assert.equal(await repo.deleteRelease(EDITOR, release.id), false);
    assert.equal(await repo.applySettings(EDITOR, release.id, { releaseDate: "2026-12-18", includeLocked: false }, TODAY), null);
    assert.equal(await repo.previewSettings(EDITOR, release.id, { releaseDate: "2026-12-18", includeLocked: false }, TODAY), null);
    assert.equal(await repo.createShareLink(EDITOR, release.id), null);
    assert.equal(await repo.listMembers(EDITOR, release.id), null);
    assert.equal(await repo.inviteMember(EDITOR, release.id, "inconnu", "editor"), null);
    assert.equal(await repo.duplicateRelease(EDITOR, release.id, TODAY), null);
  });

  test("inconnu : aucune action sur la sortie d'un autre", async () => {
    assert.equal(await repo.updateTask(STRANGER, task.id, { notes: "piraté" }), null);
    assert.equal(await repo.deleteRelease(STRANGER, release.id), false);
    assert.equal(await repo.disableShareLink(STRANGER, release.id), false);
    assert.equal(await repo.removeMember(STRANGER, release.id, EDITOR), false);
  });

  test("une tâche ne peut pas être rattachée au titre d'une autre sortie", async () => {
    const otherEp = await repo.createRelease(
      STRANGER,
      releaseCreateSchema.parse({ type: "ep", title: "EP", artistName: "X", releaseDate: "2027-05-05", platforms: ["tiktok"], tracks: [{ title: "A" }, { title: "B" }] }),
      TODAY,
    );
    const foreignTrack = otherEp.tracks[0].id;
    assert.equal(
      await repo.createTask(OWNER, release.id, { title: "X", dueDate: "2026-11-20", module: "promo", platforms: [], notes: null, trackId: foreignTrack }),
      null,
    );
  });
});

describe("Recalage", () => {
  test("report de 2 semaines : aperçu, puis statuts, notes et dates verrouillées conservés", async () => {
    const change = { releaseDate: "2026-12-18", includeLocked: false };
    const preview = await repo.previewSettings(OWNER, release.id, change, TODAY);
    assert.ok(preview.moves.length > 0);
    assert.match(preview.summary, /déplacées/);
    assert.equal(preview.lockedSkipped, 1);
    await repo.applySettings(OWNER, release.id, change, TODAY);
    const view = await repo.getRelease(OWNER, release.id);
    assert.equal(view.release.release_date, "2026-12-18");
    assert.equal(view.release.mode, "confort", "44 jours avant la sortie");
    const t = view.tasks.find((x) => x.id === task.id);
    assert.equal(t.status, "programme");
    assert.equal(t.notes, "Tourné samedi");
    assert.equal(t.due_date, "2026-11-21", "date verrouillée conservée");
    assert.equal(t.offset_days, -27, "le J de la tâche verrouillée suit le report (21 nov. → 18 déc.)");
    assert.ok(view.tasks.some((x) => x.plan_key === null), "tâche personnalisée conservée");
    assert.equal(view.tasks.find((x) => x.plan_key === "single_update_bios").due_date, "2026-12-18");
  });

  test("une tâche générée supprimée n'est jamais recréée", async () => {
    const view = await repo.getRelease(OWNER, release.id);
    const sacem = view.tasks.find((x) => x.plan_key === "single_sacem");
    assert.equal(await repo.deleteTask(OWNER, sacem.id), true);
    const after = await repo.getRelease(OWNER, release.id);
    assert.deepEqual(after.release.dismissed_keys, ["single_sacem"]);
    await repo.applySettings(OWNER, release.id, { releaseDate: "2027-01-08", includeLocked: false }, TODAY);
    const final = await repo.getRelease(OWNER, release.id);
    assert.equal(final.release.mode, "confort");
    assert.ok(!final.tasks.some((x) => x.plan_key === "single_sacem"));
    assert.ok(final.tasks.some((x) => x.plan_key === "single_trend_prep"), "bonus ajoutées en Confort");
  });
});

describe("Lien public", () => {
  test("lien actif : lecture sans notes ni liens ; désactivé ou régénéré : introuvable", async () => {
    await repo.updateTask(OWNER, task.id, { linkUrl: "https://drive.google.com/demo" });
    const link = await repo.createShareLink(OWNER, release.id);
    assert.equal(link.token.length, 64);
    const page = await repo.getPublicRelease(link.token);
    assert.equal(page.release.title, "Mon single");
    const t = page.tasks.find((x) => x.id === task.id);
    assert.ok(t && !("notes" in t) && !("link_url" in t) && !("checklist" in t));
    assert.ok(!JSON.stringify(page).includes("Tourné samedi"));
    assert.ok(!JSON.stringify(page).includes("drive.google.com"));

    const again = await repo.createShareLink(OWNER, release.id);
    assert.equal(await repo.getPublicRelease(link.token), null, "l'ancien lien ne marche plus");
    assert.ok(await repo.getPublicRelease(again.token));
    assert.equal(await repo.disableShareLink(OWNER, release.id), true);
    assert.equal(await repo.getPublicRelease(again.token), null);
    assert.equal(await repo.getShareLink(OWNER, release.id), null);
    assert.equal(await repo.getPublicRelease("pas-un-token"), null);
  });
});

describe("Comptes invités", () => {
  test("pseudo inconnu, soi-même, changement de rôle, retrait", async () => {
    assert.deepEqual(await repo.inviteMember(OWNER, release.id, "personne", "viewer"), { error: "not_found" });
    assert.deepEqual(await repo.inviteMember(OWNER, release.id, "proprio", "viewer"), { error: "self" });
    assert.equal(await repo.setMemberRole(OWNER, release.id, VIEWER, "editor"), true);
    assert.equal(await repo.roleOn(VIEWER, release.id), "editor");
    assert.equal(await repo.removeMember(OWNER, release.id, VIEWER), true);
    assert.equal(await repo.getRelease(VIEWER, release.id), null);
    assert.deepEqual((await repo.listMembers(OWNER, release.id)).map((m) => m.pseudo), ["manager"]);
  });
});

describe("Admin et suppression", () => {
  test("l'admin voit toutes les sorties, en lecture seule", async () => {
    const rows = await admin.listAllReleases(TODAY);
    assert.ok(rows.some((r) => r.id === release.id && r.owner_pseudo === "proprio"));
    assert.ok(rows.some((r) => r.id === other.id && r.owner_pseudo === "inconnu"));
    assert.equal((await admin.getReleaseAsAdmin(other.id)).role, "viewer");
  });

  test("dupliquer puis supprimer une sortie (propriétaire)", async () => {
    const copy = await repo.duplicateRelease(OWNER, release.id, TODAY);
    assert.equal(copy.release.title, "Mon single (copie)");
    assert.equal(await repo.deleteRelease(OWNER, copy.release.id), true);
    assert.equal(await repo.getRelease(OWNER, copy.release.id), null);
    const left = await sql.prepare("SELECT COUNT(*) AS n FROM drop_tasks WHERE release_id = ?1").bind(copy.release.id).first();
    assert.equal(Number(left.n), 0);
  });
});

describe("Validation des entrées", () => {
  test("refus des données invalides", () => {
    assert.equal(releaseCreateSchema.safeParse({ ...singleInput("x"), platforms: [] }).success, false);
    assert.equal(releaseCreateSchema.safeParse({ ...singleInput("x"), releaseDate: "2026-02-30" }).success, false);
    assert.equal(releaseCreateSchema.safeParse({ ...singleInput("x"), ownedAssets: ["inconnu"] }).success, false);
    assert.equal(releaseCreateSchema.safeParse({ ...singleInput("x"), type: "ep", tracks: [{ title: "Seul" }] }).success, false);
    assert.equal(taskPatchSchema.safeParse({ linkUrl: "javascript:alert(1)" }).success, false);
    assert.equal(taskPatchSchema.safeParse({}).success, false);
    assert.equal(taskPatchSchema.parse({ linkUrl: "" }).linkUrl, null);
    assert.equal(inviteSchema.parse({ pseudo: "@manager" }).pseudo, "manager");
  });
});

describe("Kanban", () => {
  test("réordonner : éditeur oui, lecteur non, tâche d'une autre sortie refusée", async () => {
    const view = await repo.getRelease(OWNER, release.id);
    const [a, b] = view.tasks;
    assert.equal(await repo.reorderTasks(EDITOR, release.id, [{ id: a.id, status: "publie", position: 0 }, { id: b.id, status: "pret", position: 1 }]), true);
    const after = await repo.getRelease(OWNER, release.id);
    assert.equal(after.tasks.find((t) => t.id === a.id).status, "publie");
    assert.ok(after.tasks.find((t) => t.id === a.id).completed_at);
    assert.equal(await repo.reorderTasks(STRANGER, release.id, [{ id: a.id, status: "a_produire", position: 0 }]), false);
    const foreign = (await repo.getRelease(STRANGER, other.id)).tasks[0];
    assert.equal(await repo.reorderTasks(OWNER, release.id, [{ id: foreign.id, status: "publie", position: 0 }]), false);
    assert.equal((await repo.getRelease(STRANGER, other.id)).tasks[0].status, foreign.status);
  });
});
