// Drop : validation de toute la configuration (npm run test:drop).
// Une erreur dans src/drop/config/ fait échouer ce test, jamais l'app en ligne.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { DROP_CONFIG, validateConfig, phaseFor, platformsFor } = await import("../src/drop/config/index.ts");

const clone = () => structuredClone(DROP_CONFIG);

describe("Configuration Drop", () => {
  test("la configuration livrée est valide", () => {
    assert.deepEqual(validateConfig(), []);
  });

  test("nombre de tâches par modèle (annexe de la spec)", () => {
    assert.equal(DROP_CONFIG.templates.single.tasks.length, 27);
    assert.equal(DROP_CONFIG.templates.clip.tasks.length, 11);
    assert.equal(DROP_CONFIG.templates.ep.tasks.length, 11);
  });

  test("phases déduites du J idéal", () => {
    assert.equal(phaseFor(DROP_CONFIG, -60), "preparer");
    assert.equal(phaseFor(DROP_CONFIG, -22), "preparer");
    assert.equal(phaseFor(DROP_CONFIG, -21), "annoncer");
    assert.equal(phaseFor(DROP_CONFIG, -1), "annoncer");
    assert.equal(phaseFor(DROP_CONFIG, 0), "sortir");
    assert.equal(phaseFor(DROP_CONFIG, 1), "faire_vivre");
    assert.equal(phaseFor(DROP_CONFIG, 28), "faire_vivre");
  });

  test("plateformes déduites des formats", () => {
    const task = (id) => Object.values(DROP_CONFIG.templates).flatMap((t) => t.tasks).find((t) => t.id === id);
    assert.deepEqual(platformsFor(DROP_CONFIG, task("single_master_cover")), []);
    assert.deepEqual(platformsFor(DROP_CONFIG, task("single_countdown_stories")), ["instagram"]);
    assert.deepEqual(platformsFor(DROP_CONFIG, task("single_teaser_1")), ["tiktok", "instagram", "youtube"]);
    assert.deepEqual(platformsFor(DROP_CONFIG, task("clip_premiere")), ["youtube"]);
  });

  test("exceptions « drop » : pitch Spotify et pitch médias uniquement", () => {
    const drops = Object.values(DROP_CONFIG.templates)
      .flatMap((t) => t.tasks)
      .filter((t) => t.ifTooLate === "drop")
      .map((t) => t.id)
      .sort();
    assert.deepEqual(drops, ["ep_spotify_pitch", "single_media_pitch", "single_spotify_pitch"]);
  });

  describe("les erreurs de configuration sont détectées", () => {
    const expectError = (mutate, pattern) => {
      const c = clone();
      mutate(c);
      const errors = validateConfig(c);
      assert.ok(errors.some((e) => pattern.test(e)), `erreur attendue ${pattern}, reçu : ${JSON.stringify(errors)}`);
    };

    test("format inconnu", () => expectError((c) => (c.templates.single.tasks[3].formats = ["inconnu"]), /format inconnu/));
    test("contenu d'inventaire inconnu", () => expectError((c) => (c.templates.single.tasks[0].readyIf = "rien"), /contenu inconnu/));
    test("identifiant de tâche en double", () =>
      expectError((c) => (c.templates.clip.tasks[0].id = c.templates.single.tasks[0].id), /en double/));
    test("J min avant le J idéal", () => expectError((c) => (c.templates.single.tasks[0].minOffset = -50), /J min/));
    test("tâche d'avant-sortie sans J min", () => expectError((c) => (c.templates.single.tasks[0].minOffset = null), /J min/));
    test("priorité inconnue", () => expectError((c) => (c.templates.ep.tasks[0].priority = "urgente"), /templates\/ep\.ts/));
    test("modes dans le désordre", () => expectError((c) => (c.settings.modes[1].minDays = 50), /plus grand/));
    test("phases avec un trou", () => expectError((c) => (c.phases[1].from = -20), /sans trou/));
    test("tâche Réseaux sans format", () => expectError((c) => (c.templates.single.tasks[7].formats = []), /au moins un format/));
    test("perTrack hors EP", () => expectError((c) => (c.templates.single.tasks[0].perTrack = true), /perTrack/));
    test("replaces vers une tâche inconnue", () => expectError((c) => (c.templates.clip.tasks[7].replaces = "nope"), /replaces/));
    test("texte vide", () => expectError((c) => (c.templates.single.tasks[0].why = "  "), /templates\/single\.ts/));
  });
});
