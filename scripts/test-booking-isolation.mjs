// Test de cloisonnement du module Booking (npm run test:booking).
// Sur une base locale neuve (file:test.db) : deux artistes A et B ont chacun lieux privés, contacts,
// campagnes, démarches, modèles et imports. Chaque fonction de src/booking/repo.ts appelée avec l'id
// de A ne doit jamais renvoyer ni modifier une donnée de B.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { after, before, describe, test } from "node:test";

const DB_FILE = "test.db";
for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
delete process.env.TURSO_AUTH_TOKEN;
execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env, stdio: "ignore" });

const { sql } = await import("../src/lib/sql.ts");
const repo = await import("../src/booking/repo.ts");
const admin = await import("../src/booking/admin-repo.ts");

const OLD = "2026-01-01T10:00:00.000Z"; // dernière action ancienne : relance due
const TODAY = "2026-11-02";

async function createArtist(pseudo) {
  const id = crypto.randomUUID();
  await sql
    .prepare("INSERT INTO users (id, pseudo, first_name, last_name, password_hash, salt, created_at) VALUES (?1, ?2, ?3, 'Test', 'x', 'x', ?4)")
    .bind(id, pseudo, pseudo, new Date().toISOString())
    .run();
  return id;
}

/** Données complètes d'un artiste (toutes fictives). */
async function seedArtist(userId, label) {
  await repo.saveProfile(userId, { stage_name: `Artiste ${label}`, style: "rap", followup_days: 7 });
  const venue = await repo.createPrivateVenue(userId, { name: `Le Lieu secret ${label}`, city: "Nantes", type: "Bar-concert" });
  const contact = await repo.createContact(userId, { venue_id: venue.id, first_name: `Prog ${label}`, email: `prog.${label.toLowerCase()}@exemple-demo.fr` });
  const campaign = await repo.createCampaign(userId, { name: `Tournée ${label}`, target_period: "printemps 2027" });
  const outreach = await repo.createOutreach(userId, SHARED.id, { campaign_id: campaign.id, contact_id: contact.contact.id, status: "contacted" });
  await sql.prepare("UPDATE bk_outreach SET last_action_at = ?1 WHERE id = ?2").bind(OLD, outreach.id).run();
  const privateOutreach = await repo.createOutreach(userId, venue.id, { status: "confirmed", fee_cents: 30000 });
  const template = await repo.duplicateTemplate(userId, "mma-t1");
  const importId = crypto.randomUUID();
  await sql
    .prepare("INSERT INTO bk_imports (id, user_id, filename, rows_total, created_at) VALUES (?1, ?2, ?3, 1, ?4)")
    .bind(importId, userId, `suivi-${label}.xlsx`, new Date().toISOString())
    .run();
  return { venue, contact: contact.contact, campaign, outreach, privateOutreach, template, importId };
}

/** Toutes les lignes d'un artiste, pour vérifier qu'elles n'ont pas bougé. */
async function snapshot(userId) {
  const tables = {
    bk_venues: "owner_user_id",
    bk_contacts: "user_id",
    bk_campaigns: "user_id",
    bk_outreach: "user_id",
    bk_templates: "user_id",
    bk_imports: "user_id",
    bk_profiles: "user_id",
  };
  const out = {};
  for (const [table, col] of Object.entries(tables)) {
    out[table] = (await sql.prepare(`SELECT * FROM ${table} WHERE ${col} = ?1 ORDER BY 1`).bind(userId).all()).results;
  }
  return out;
}

let A, B, a, b, SHARED, DRAFT, bBefore;

before(async () => {
  A = await createArtist("artiste_a");
  B = await createArtist("artiste_b");
  SHARED = await admin.saveSharedVenue(null, { name: "La Salle Démo", city: "Rennes", type: "SMAC / salle de musiques actuelles" });
  await admin.setVenueStatus(SHARED.id, "published");
  DRAFT = await admin.saveSharedVenue(null, { name: "Brouillon Démo", city: "Paris" });
  a = await seedArtist(A, "A");
  b = await seedArtist(B, "B");
  bBefore = await snapshot(B);
});

const ids = (rows) => rows.map((r) => r.id);
const noneOf = (rows, field, value) => assert.ok(rows.every((r) => r[field] === value), `${field} doit valoir ${value} partout`);

describe("Lieux", () => {
  test("A voit l'annuaire publié et ses lieux privés, jamais ceux de B ni les brouillons", async () => {
    const venues = await repo.listVenues(A, { limit: 200 });
    assert.ok(ids(venues).includes(SHARED.id));
    assert.ok(ids(venues).includes(a.venue.id));
    assert.ok(!ids(venues).includes(b.venue.id));
    assert.ok(!ids(venues).includes(DRAFT.id));
    assert.deepEqual(ids(await repo.listVenues(A, { privateOnly: true })), [a.venue.id]);
    assert.equal((await repo.listVenues(A, { q: "secret B" })).length, 0);
  });
  test("accès par id et par nom au lieu privé de B : introuvable", async () => {
    assert.equal(await repo.getVenue(A, b.venue.id), null);
    assert.equal(await repo.getVenue(A, DRAFT.id), null);
    assert.equal(await repo.findVenueByName(A, "Le lieu secret B", "nantes"), null);
    assert.equal((await repo.findVenueByName(A, "la salle demo", "Rennes"))?.id, SHARED.id);
  });
  test("A ne peut ni modifier ni supprimer un lieu de B ou de l'annuaire", async () => {
    assert.equal(await repo.updatePrivateVenue(A, b.venue.id, { name: "Piraté" }), null);
    assert.equal(await repo.updatePrivateVenue(A, SHARED.id, { name: "Piraté" }), null);
    assert.equal(await repo.deletePrivateVenue(A, b.venue.id), false);
    assert.equal(await repo.deletePrivateVenue(A, SHARED.id), false);
  });
});

describe("Contacts", () => {
  test("A ne liste que ses contacts", async () => {
    const contacts = await repo.listContacts(A);
    assert.ok(contacts.length > 0);
    noneOf(contacts, "user_id", A);
    assert.equal((await repo.listContacts(A, { q: "Prog B" })).length, 0);
    assert.equal((await repo.listContacts(A, { venueId: b.venue.id })).length, 0);
  });
  test("accès, modification et suppression d'un contact de B : refusés", async () => {
    assert.equal(await repo.getContact(A, b.contact.id), null);
    assert.equal(await repo.updateContact(A, b.contact.id, { notes: "x" }), null);
    assert.equal(await repo.deleteContact(A, b.contact.id), false);
    assert.equal(await repo.findContactByEmail(A, b.contact.email), null);
  });
  test("A ne peut pas rattacher un contact au lieu privé de B", async () => {
    assert.deepEqual(await repo.createContact(A, { venue_id: b.venue.id, first_name: "X" }), { error: "venue" });
    assert.deepEqual(await repo.updateContact(A, a.contact.id, { venue_id: b.venue.id }), { error: "venue" });
  });
  test("le même email peut exister chez A et chez B, sans rien révéler", async () => {
    const r = await repo.createContact(A, { email: ` PROG.B@exemple-demo.fr ` });
    assert.equal(r.contact.user_id, A);
    assert.equal(r.contact.email_normalized, "prog.b@exemple-demo.fr");
    assert.deepEqual(await repo.createContact(A, { email: "prog.b@exemple-demo.fr" }), { error: "duplicate" });
  });
});

describe("Profil et modèles", () => {
  test("chaque artiste a son profil", async () => {
    assert.equal((await repo.getProfile(A)).stage_name, "Artiste A");
    await repo.saveProfile(A, { city: "Nantes" });
    assert.equal((await repo.getProfile(B)).city, null);
  });
  test("A voit les modèles Mymusicads et les siens, jamais ceux de B", async () => {
    const templates = await repo.listTemplates(A);
    assert.equal(templates.filter((t) => t.user_id === null).length, 8);
    assert.ok(ids(templates).includes(a.template.id));
    assert.ok(!ids(templates).includes(b.template.id));
    assert.equal(await repo.getTemplate(A, b.template.id), null);
    assert.equal(await repo.duplicateTemplate(A, b.template.id), null);
    assert.equal(await repo.updateTemplate(A, b.template.id, { body: "x" }), null);
    assert.equal(await repo.deleteTemplate(A, b.template.id), false);
  });
  test("les modèles Mymusicads sont en lecture seule pour les artistes", async () => {
    assert.equal(await repo.updateTemplate(A, "mma-t1", { body: "x" }), null);
    assert.equal(await repo.deleteTemplate(A, "mma-t1"), false);
  });
});

describe("Campagnes et démarches", () => {
  test("A ne liste que ses campagnes et démarches", async () => {
    noneOf(await repo.listCampaigns(A), "user_id", A);
    noneOf(await repo.listOutreach(A), "user_id", A);
    assert.equal((await repo.listOutreach(A, { campaignId: b.campaign.id })).length, 0);
  });
  test("accès, modification et suppression d'une campagne de B : refusés", async () => {
    assert.equal(await repo.getCampaign(A, b.campaign.id), null);
    assert.equal(await repo.updateCampaign(A, b.campaign.id, { name: "x" }), null);
    assert.equal(await repo.deleteCampaign(A, b.campaign.id), false);
    assert.equal(await repo.addVenuesToCampaign(A, b.campaign.id, [SHARED.id]), null);
  });
  test("accès, modification et suppression d'une démarche de B : refusés", async () => {
    assert.equal(await repo.getOutreach(A, b.outreach.id), null);
    assert.equal(await repo.updateOutreach(A, b.outreach.id, { status: "declined" }), null);
    assert.equal(await repo.deleteOutreach(A, b.outreach.id), false);
  });
  test("A ne peut pas lier sa démarche à une campagne, un contact, un lieu ou un modèle de B", async () => {
    assert.equal(await repo.createOutreach(A, b.venue.id), null);
    assert.equal(await repo.createOutreach(A, SHARED.id, { campaign_id: b.campaign.id }), null);
    assert.equal(await repo.createOutreach(A, SHARED.id, { contact_id: b.contact.id }), null);
    assert.equal(await repo.createOutreach(A, SHARED.id, { template_id: b.template.id }), null);
    assert.equal(await repo.updateOutreach(A, a.outreach.id, { campaign_id: b.campaign.id }), null);
    assert.equal(await repo.updateOutreach(A, a.outreach.id, { contact_id: b.contact.id }), null);
    assert.equal(await repo.addVenuesToCampaign(A, a.campaign.id, [b.venue.id, DRAFT.id]), 0);
  });
  test("la base refuse elle-même une démarche de A pointant vers la campagne ou le contact de B", async () => {
    const insert = (campaignId, contactId) =>
      sql
        .prepare(
          `INSERT INTO bk_outreach (id, user_id, campaign_id, venue_id, contact_id, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'to_contact', 'x', 'x')`,
        )
        .bind(crypto.randomUUID(), A, campaignId, DRAFT.id, contactId)
        .run();
    await assert.rejects(insert(b.campaign.id, null), /FOREIGN KEY/);
    await assert.rejects(insert(null, b.contact.id), /FOREIGN KEY/);
  });
  test("relances et tableau de bord ne comptent que les démarches de A", async () => {
    const due = await repo.listFollowupsDue(A, TODAY);
    assert.deepEqual(ids(due), [a.outreach.id]);
    assert.equal(due[0].due_on, "2026-01-08");
    const dashA = await repo.getDashboard(A, TODAY);
    assert.equal(dashA.sent, 2);
    assert.equal(dashA.confirmed, 1);
    assert.equal(dashA.confirmedFeesCents, 30000);
    assert.equal(dashA.lateFollowups, 1);
  });
  test("modifier une démarche met à jour la date de dernière action", async () => {
    const o = await repo.updateOutreach(A, a.outreach.id, { status: "followup_1" });
    assert.equal(o.status, "followup_1");
    assert.ok(o.last_action_at > OLD);
    assert.equal((await repo.listFollowupsDue(A, TODAY)).length, 0);
  });
});

describe("Imports", () => {
  test("A ne voit jamais les imports de B", async () => {
    const imports = await repo.listImports(A);
    assert.deepEqual(ids(imports), [a.importId]);
    assert.equal(await repo.getImport(A, b.importId), null);
  });
});

describe("Opérations de A sur ses propres données", () => {
  test("supprimer ses contacts, campagnes et lieux ne touche pas B", async () => {
    assert.equal(await repo.deleteContact(A, a.contact.id), true);
    assert.equal(await repo.deleteCampaign(A, a.campaign.id), true);
    assert.equal(await repo.deletePrivateVenue(A, a.venue.id), true);
    assert.equal((await repo.getOutreach(A, a.outreach.id)).campaign_id, null);
  });
});

describe("Aucune donnée de B n'a changé", () => {
  test("instantané identique avant / après", async () => {
    assert.deepEqual(await snapshot(B), bBefore);
  });
  test("repo.ts ne lit jamais la base maître", () => {
    assert.ok(!fs.readFileSync("src/booking/repo.ts", "utf8").replace(/^\s*\/\/.*$/gm, "").includes("bk_master"));
  });
});

describe("Base maître", () => {
  test("les contacts de A et de B arrivent dédoublonnés, avec leurs sources", async () => {
    await admin.copyToMaster(
      [
        { venue_name: "La Salle Démo", city: "Rennes", first_name: "Camille", email: "Booking@Salle-Demo.fr " },
        { venue_name: "Bar Démo", city: "Nantes", first_name: "Sam", phone: "06 00 00 00 01" },
      ],
      { userId: A, userLabel: "artiste_a", importId: a.importId, importFilename: "suivi-A.xlsx" },
    );
    await admin.copyToMaster(
      [{ venue_name: "La Salle Démo", city: "Rennes", last_name: "Durand", email: "booking@salle-demo.fr" }],
      { userId: B, userLabel: "artiste_b", importId: b.importId, importFilename: "suivi-B.xlsx" },
    );
    const { contacts, total } = await admin.listMasterContacts();
    assert.equal(total, 2);
    const salle = contacts.find((c) => c.email_normalized === "booking@salle-demo.fr");
    assert.equal(salle.email_kind, "generic");
    assert.equal(salle.first_name, "Camille");
    assert.equal(salle.last_name, "Durand");
    const sources = await admin.getMasterSources(salle.id);
    assert.deepEqual(sources.map((s) => s.user_label).sort(), ["artiste_a", "artiste_b"]);
    assert.ok(contacts.some((c) => c.email_normalized === null && c.phone));
  });
  test("un contact retiré n'est ni réactivé, ni complété, ni exporté", async () => {
    const { contacts } = await admin.listMasterContacts({ q: "salle-demo" });
    await admin.setMasterStatus(contacts[0].id, "removed");
    await admin.copyToMaster([{ email: "booking@salle-demo.fr", first_name: "Revenu" }], {
      userId: A, userLabel: "artiste_a", importId: null, importFilename: null,
    });
    const after = (await admin.listMasterContacts({ status: "removed" })).contacts[0];
    assert.equal(after.status, "removed");
    assert.equal(after.first_name, null);
    assert.equal(after.email, null);
    assert.equal((await admin.getMasterSources(after.id)).length, 2);
    assert.ok(!(await admin.exportMasterContacts()).some((c) => c.id === after.id));
  });
  test("promouvoir un lieu privé copie le lieu, jamais les contacts", async () => {
    const shared = await admin.promoteVenue(b.venue.id);
    assert.equal(shared.owner_user_id, null);
    assert.equal(shared.status, "draft");
    assert.equal((await sql.prepare("SELECT COUNT(*) AS n FROM bk_contacts WHERE venue_id = ?1").bind(shared.id).first()).n, 0);
  });
});

after(() => {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
});
