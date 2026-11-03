// Tests de lecture des fichiers importés (npm run test:booking) : CSV, encodages, dates, jauges,
// statuts, colonnes du modèle Mymusicads. Aucune base de données.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { decodeText, parseCsv, toTable } = await import("../src/booking/import/parse.ts");
const { autoMap, isMymusicadsModel, isHelperSheet } = await import("../src/booking/import/fields.ts");
const { parseDate, parseCapacity, parseStatus, parseContactText, parseVenueType, parseGenres, parseCity, interpretRow } = await import(
  "../src/booking/import/rows.ts"
);

describe("Fichiers CSV", () => {
  test("Windows-1252 (export Excel) et UTF-8 avec BOM", () => {
    const latin = new Uint8Array([0x56, 0x69, 0x6c, 0x6c, 0x65, 0x3b, 0x52, 0xe9, 0x67, 0x69, 0x6f, 0x6e]); // « Ville;Région »
    assert.equal(decodeText(latin), "Ville;Région");
    assert.equal(decodeText(new TextEncoder().encode("﻿Ville;Région")), "Ville;Région");
  });
  test("séparateurs « ; » et « , », guillemets, retours à la ligne dans une cellule", () => {
    assert.deepEqual(parseCsv('Lieu;Notes\r\n"Le Bar; ouest";"ligne 1\nligne ""2"""\r\n'), [
      ["Lieu", "Notes"],
      ["Le Bar; ouest", 'ligne 1\nligne "2"'],
    ]);
    assert.deepEqual(parseCsv("Lieu,Ville\nCave,Nantes"), [["Lieu", "Ville"], ["Cave", "Nantes"]]);
  });
  test("lignes vides et colonnes vides ignorées, numéros de ligne conservés", () => {
    const t = toTable([[], ["Lieu", "", "Ville"], ["A", "", "Nantes"], ["", "", ""], ["B", "", "Rennes"]]);
    assert.deepEqual(t.headers, ["Lieu", "Ville"]);
    assert.deepEqual(t.rows, [["A", "Nantes"], ["B", "Rennes"]]);
    assert.deepEqual(t.lines, [3, 5]);
  });
});

describe("Valeurs", () => {
  test("dates : JJ/MM/AAAA, AAAA-MM-JJ, numéro de série Excel, valeurs impossibles", () => {
    assert.equal(parseDate("15/10/2026"), "2026-10-15");
    assert.equal(parseDate("5/3/26"), "2026-03-05");
    assert.equal(parseDate("2026-10-15"), "2026-10-15");
    assert.equal(parseDate("46310"), "2026-10-15");
    assert.equal(parseDate("31/02/2026"), null);
    assert.equal(parseDate("bientôt"), null);
  });
  test("jauges en texte libre", () => {
    assert.equal(parseCapacity("240 assis / 150 debout"), 240);
    assert.equal(parseCapacity("Grande salle 2 400 à 3 600"), 2400);
    assert.equal(parseCapacity("35 places"), 35);
    assert.equal(parseCapacity("à vérifier"), null);
    assert.equal(parseCapacity("moyen (≈30 concerts, ≈25 000 spectateurs)"), 25000);
    assert.equal(parseCapacity("moyen (≈21 concerts)"), null);
  });
  test("statuts du modèle Mymusicads", () => {
    const expected = {
      "À contacter": "to_contact",
      Contacté: "contacted",
      Relancé: "followup_1",
      "En discussion": "discussing",
      "Booké / Programmé": "confirmed",
      Refus: "declined",
      "Sans réponse": "no_reply",
    };
    for (const [raw, code] of Object.entries(expected)) assert.equal(parseStatus(raw), code, raw);
  });
  test("contact en texte libre : nom + e-mail, ou mention sans nom", () => {
    assert.deepEqual(parseContactText("Jeanne Martin – prog@lieu-fictif.fr"), { emails: ["prog@lieu-fictif.fr"], name: "Jeanne Martin", role: null, note: null });
    assert.deepEqual(parseContactText("Jeanne Martin (programmatrice) – prog@lieu-fictif.fr"), {
      emails: ["prog@lieu-fictif.fr"], name: "Jeanne Martin", role: "programmatrice", note: null,
    });
    assert.equal(parseContactText("à vérifier").name, null);
    assert.equal(parseContactText("Léa Exemple (directrice) – e-mail à vérifier").note, "Léa Exemple (directrice) – e-mail à vérifier");
    const r = parseContactText("Non trouvé (formulaire sur le site)");
    assert.equal(r.name, null);
    assert.equal(r.emails.length, 0);
    assert.ok(r.note);
  });
  test("types, esthétiques et villes", () => {
    const types = ["Cave / club de jazz", "Festival", "Bar-concert", "Salle de spectacle"];
    assert.equal(parseVenueType("Club de jazz", types, null), "Cave / club de jazz");
    assert.equal(parseVenueType("", types, "Festival"), "Festival");
    assert.equal(parseVenueType("club", types, null, "jazz, swing"), "Cave / club de jazz");
    assert.equal(parseVenueType("club / cabaret", types, null, "chanson"), "Salle de spectacle");
    assert.deepEqual(parseGenres("jazz, swing / bebop", ["Jazz"]), ["Jazz", "Swing", "Bebop"]);
    assert.equal(parseCity("Paris 11e"), "Paris");
  });
});

describe("Modèle Mymusicads", () => {
  const SALLES = [
    "ID", "Nom", "Type", "Zone", "Arrondissement / Ville", "Adresse", "Code postal", "Jauge", "Styles", "Jam session", "Détail jam",
    "Statut lieu", "Site web", "E-mail général", "Contact programmation", "Contact prog. trouvé", "Téléphone", "Instagram", "Notes",
    "Source", "Priorité", "Statut contact", "Interlocuteur", "Date 1er contact", "Date relance", "Commentaires suivi",
  ];
  test("reconnu à ses colonnes, onglets annexes écartés", () => {
    assert.ok(isMymusicadsModel(SALLES));
    assert.ok(isHelperSheet("Lisez-moi") && isHelperSheet("Tableau de bord") && isHelperSheet("Listes"));
    assert.ok(!isHelperSheet("Salles Paris"));
  });
  test("correspondance automatique des colonnes", () => {
    const m = autoMap(SALLES);
    const expect = {
      Nom: "venue_name", Type: "venue_type", "Arrondissement / Ville": "city", "Code postal": "postal_code", Jauge: "capacity",
      Styles: "genres", "Site web": "website", "E-mail général": "email_general", "Contact programmation": "contact_text",
      Téléphone: "phone", Instagram: "venue_instagram", Notes: "notes", "Statut contact": "status", Interlocuteur: "full_name",
      "Date 1er contact": "first_contact_at", "Date relance": "last_action_at", "Commentaires suivi": "notes", ID: "ignore",
      "Statut lieu": "ignore", Source: "ignore",
    };
    for (const [h, f] of Object.entries(expect)) assert.equal(m[h], f, h);
  });
  test("une ligne donne le contact prog et l'e-mail général, plus la démarche", () => {
    const r = interpretRow(
      {
        venue_name: "Cave Fictive", city: "Paris 5e", postal_code: "75005", capacity: "80 places", contact_text: "Jeanne Martin – prog@cave-fictive.fr",
        email_general: "contact@cave-fictive.fr", phone: "01 00 00 00 00", status: "Relancé", first_contact_at: "01/10/2026", last_action_at: "11/10/2026",
        notesList: ["Notes : jam le mardi"],
      },
      { venueTypes: [], genres: [], defaultType: null },
    );
    assert.equal(r.venue.city, "Paris");
    assert.equal(r.venue.department, "75");
    assert.equal(r.venue.region, "Île-de-France");
    assert.equal(r.contacts.length, 2);
    assert.equal(r.contacts[0].first_name, "Jeanne");
    assert.equal(r.contacts[0].phone, "01 00 00 00 00");
    assert.match(r.contacts[0].notes, /jam le mardi/);
    assert.equal(r.contacts[1].email_normalized, "contact@cave-fictive.fr");
    assert.deepEqual(r.outreach && [r.outreach.status, r.outreach.first_contact_at, r.outreach.last_action_at], ["followup_1", "2026-10-01", "2026-10-11"]);
  });
  test("ligne sans lieu ni contact : invalide ; e-mail mal formé : signalé sans bloquer", () => {
    assert.ok(interpretRow({ notesList: ["Notes : x"] }, { venueTypes: [], genres: [], defaultType: null }).error);
    const r = interpretRow({ venue_name: "Bar", email: "prog@@bar" }, { venueTypes: [], genres: [], defaultType: null });
    assert.equal(r.error, null);
    assert.deepEqual(r.invalidEmails, ["prog@@bar"]);
    const n = interpretRow({ venue_name: "Bar", email_general: "à vérifier (formulaire)" }, { venueTypes: [], genres: [], defaultType: null });
    assert.deepEqual(n.invalidEmails, []);
    assert.match(n.notes, /E-mail général : à vérifier/);
    assert.equal(r.contacts[0].email_normalized, null);
  });
});
