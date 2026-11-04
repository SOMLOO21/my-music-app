// Drop : tests du moteur de planning et du recalage (npm run test:drop). Aucune base de données.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { DROP_CONFIG: config } = await import("../src/drop/config/index.ts");
const { generatePlan, reschedule, proposeSingleDates, addDays, diffDays, todayInParis, summarize } = await import(
  "../src/drop/engine/index.ts"
);

const TODAY = "2026-11-04";
const ALL = ["tiktok", "instagram", "youtube"];
const single = (days, extra = {}) =>
  generatePlan({ type: "single", releaseDate: addDays(TODAY, days), platforms: ALL, ownedAssets: [], adminEnabled: true, ...extra }, config, TODAY);
const byKey = (plan) => Object.fromEntries(plan.tasks.map((t) => [t.key, t]));
const template = (id) => Object.values(config.templates).flatMap((t) => t.tasks).find((t) => t.id === id);
const codes = (plan) => plan.warnings.map((w) => w.code);

/** Vérifications communes à tous les plannings. */
function checkInvariants(plan) {
  const keys = plan.tasks.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length, "clés uniques");
  for (let i = 1; i < plan.tasks.length; i++) assert.ok(plan.tasks[i - 1].dueDate <= plan.tasks[i].dueDate, "tâches triées par date");
  for (const t of plan.tasks) {
    assert.ok(t.dueDate >= TODAY, `${t.key} n'est pas dans le passé`);
    assert.equal(t.dueDate, addDays(t.anchorDate, t.offsetDays));
    const tpl = template(t.templateTaskId);
    if (tpl.idealOffset < 0) assert.ok(t.dueDate < t.anchorDate, `${t.key} reste avant sa sortie`);
    if (tpl.idealOffset >= 0) assert.ok(t.offsetDays >= 0, `${t.key} reste après sa sortie`);
    assert.ok(t.idea && t.why && t.how.length > 0, `${t.key} a ses textes`);
  }
  // Charge : pas plus de N tâches réseaux le même jour avant la sortie, sauf avertissement.
  if (!codes(plan).includes("overload")) {
    const perDay = new Map();
    for (const t of plan.tasks.filter((t) => t.module === "reseaux")) perDay.set(t.dueDate, (perDay.get(t.dueDate) ?? 0) + 1);
    for (const t of plan.tasks.filter((t) => t.module === "reseaux" && t.offsetDays < 0)) {
      assert.ok(perDay.get(t.dueDate) <= config.settings.maxSocialTasksPerDay, `trop de tâches réseaux le ${t.dueDate}`);
    }
  }
}

/** L'ordre relatif des tâches d'avant-sortie est conservé (sauf J min, qui prime). */
function checkOrder(plan) {
  const pre = plan.tasks.filter((t) => template(t.templateTaskId).idealOffset < 0 && !t.alert);
  for (const a of pre) {
    for (const b of pre) {
      const ta = template(a.templateTaskId);
      const tb = template(b.templateTaskId);
      if (ta.idealOffset < tb.idealOffset && ta.minOffset <= tb.minOffset) {
        // Le lissage peut décaler d'un ou deux jours : tolérance de 2 jours.
        assert.ok(a.offsetDays <= b.offsetDays + 2, `${a.key} (${a.offsetDays}) devrait précéder ${b.key} (${b.offsetDays})`);
      }
    }
  }
}

describe("Dates", () => {
  test("ajout de jours et écarts, passage à l'heure d'hiver compris", () => {
    assert.equal(addDays("2026-10-24", 2), "2026-10-26");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(diffDays("2026-03-28", "2026-03-30"), 2);
    assert.equal(diffDays("2026-11-10", "2026-11-04"), -6);
  });
  test("date du jour à Paris", () => {
    assert.equal(todayInParis(new Date("2026-11-04T23:30:00Z")), "2026-11-05");
    assert.equal(todayInParis(new Date("2026-07-01T21:59:00Z")), "2026-07-01");
  });
});

describe("Single selon le délai", () => {
  test("D = 60 : Confort, toutes les tâches à leur date idéale", () => {
    const plan = single(60);
    assert.equal(plan.mode, "confort");
    assert.equal(plan.daysLeft, 60);
    assert.equal(plan.tasks.length, 27);
    for (const t of plan.tasks) assert.equal(t.offsetDays, template(t.templateTaskId).idealOffset, t.key);
    assert.ok(plan.tasks.every((t) => t.status === "a_produire"));
    assert.deepEqual(plan.warnings, []);
    assert.equal(plan.tasks[0].key, "single_master_cover");
    assert.equal(plan.tasks[0].dueDate, "2026-11-22");
    assert.equal(plan.tasks.at(-1).key, "single_last_push");
    checkInvariants(plan);
  });

  test("D = 30 : Standard, bonus retirés, planning resserré dans le délai", () => {
    const plan = single(30);
    assert.equal(plan.mode, "standard");
    assert.ok(plan.tasks.every((t) => t.priority !== "bonus"));
    assert.equal(plan.tasks.length, 22);
    const t = byKey(plan);
    // f = 30 / 42 : -42 → -30 (aujourd'hui), -28 → -20, J min respecté
    assert.equal(t.single_master_cover.offsetDays, -30);
    assert.equal(t.single_master_cover.dueDate, TODAY);
    assert.equal(t.single_spotify_pitch.offsetDays, -20);
    for (const task of plan.tasks) {
      const tpl = template(task.templateTaskId);
      if (tpl.minOffset !== null) assert.ok(task.offsetDays <= tpl.minOffset, `${task.key} respecte son J min`);
    }
    assert.deepEqual(plan.warnings, []);
    checkInvariants(plan);
    checkOrder(plan);
  });

  test("D = 14 : Express, recommandées hors réseaux retirées, tâche impossible placée aujourd'hui", () => {
    const plan = single(14);
    assert.equal(plan.mode, "express");
    const t = byKey(plan);
    assert.ok(!t.single_sacem && !t.single_press_kit && !t.single_media_pitch, "recommandées admin/promo retirées");
    assert.ok(t.single_story_face_cam && t.single_carousel_story, "recommandées réseaux gardées");
    assert.ok(plan.tasks.every((x) => x.priority !== "bonus"));
    // Master (J min -21) ne tient plus : aujourd'hui, avec alerte.
    assert.equal(t.single_master_cover.dueDate, TODAY);
    assert.ok(t.single_master_cover.alert);
    assert.deepEqual(codes(plan), ["too_late_today"]);
    // Le pitch Spotify tient encore (J min -7) : resserré mais gardé.
    assert.ok(t.single_spotify_pitch.offsetDays <= -7);
    checkInvariants(plan);
    checkOrder(plan);
  });

  test("D = 5 : Urgence, essentielles seulement, pitch Spotify abandonné avec explication", () => {
    const plan = single(5);
    assert.equal(plan.mode, "urgence");
    assert.ok(plan.tasks.every((x) => x.priority === "essentielle"));
    const t = byKey(plan);
    assert.equal(t.single_spotify_pitch, undefined);
    const dropped = plan.warnings.find((w) => w.code === "too_late_dropped");
    assert.equal(dropped.taskKey, "single_spotify_pitch");
    assert.match(dropped.message, /au moins 7 jours avant la sortie : avec 5 jours, ce n'est plus possible/);
    assert.equal(t.single_distribution.dueDate, TODAY);
    assert.match(t.single_distribution.alert, /distributeur/);
    checkInvariants(plan);
  });

  test("D = -3 : sortie passée, seulement l'après-sortie encore à venir", () => {
    const plan = single(-3);
    assert.equal(plan.daysLeft, -3);
    assert.ok(codes(plan).includes("past_release"));
    assert.ok(plan.tasks.length > 0);
    for (const t of plan.tasks) assert.ok(template(t.templateTaskId).idealOffset >= 0 && t.dueDate >= TODAY, t.key);
    checkInvariants(plan);
  });

  test("déterministe : mêmes entrées, même planning", () => {
    assert.deepEqual(single(30), single(30));
  });
});

describe("Options de la sortie", () => {
  test("module admin désactivé", () => {
    const plan = single(60, { adminEnabled: false });
    assert.ok(plan.tasks.every((t) => t.module !== "admin"));
    assert.equal(plan.tasks.length, 24);
  });

  test("une seule plateforme cochée (TikTok)", () => {
    const plan = single(60, { platforms: ["tiktok"] });
    const t = byKey(plan);
    assert.equal(t.single_countdown_stories, undefined, "stories Instagram retirées");
    assert.equal(t.single_fan_reposts, undefined);
    assert.deepEqual(t.single_announce.platforms, ["tiktok"]);
    assert.deepEqual(t.single_release_post.platforms, ["tiktok"]);
    assert.deepEqual(t.single_master_cover.platforms, [], "tâche sans plateforme toujours gardée");
    assert.ok(plan.tasks.every((x) => x.platforms.every((p) => p === "tiktok")));
  });

  test("contenus déjà disponibles : statut « Prêt »", () => {
    const plan = single(60, { ownedAssets: ["cover", "vertical_videos"] });
    const ready = plan.tasks.filter((t) => t.status === "pret").map((t) => t.key).sort();
    assert.deepEqual(ready, ["single_announce", "single_master_cover", "single_shooting_day", "single_teaser_1"]);
  });

  test("clip sorti avec le single : « Sortie du clip » remplace le « Post de sortie »", () => {
    const plan = generatePlan(
      { type: "clip", releaseDate: addDays(TODAY, 60), platforms: ALL, ownedAssets: [], adminEnabled: true, clipIsRelaunch: false },
      config,
      TODAY,
    );
    const t = byKey(plan);
    assert.equal(t.single_release_post, undefined);
    assert.equal(t.clip_release.offsetDays, 0);
    assert.ok(t.single_teaser_1 && t.clip_teaser_1);
    checkInvariants(plan);
  });

  test("clip de relance : module clip seul", () => {
    const plan = generatePlan(
      { type: "clip", releaseDate: addDays(TODAY, 40), platforms: ALL, ownedAssets: [], adminEnabled: true, clipIsRelaunch: true },
      config,
      TODAY,
    );
    assert.ok(plan.tasks.every((t) => t.templateTaskId.startsWith("clip_")));
    checkInvariants(plan);
  });

  test("YouTube non coché : pas de première YouTube", () => {
    const plan = generatePlan(
      { type: "clip", releaseDate: addDays(TODAY, 40), platforms: ["instagram"], ownedAssets: [], adminEnabled: true, clipIsRelaunch: true },
      config,
      TODAY,
    );
    assert.equal(byKey(plan).clip_premiere, undefined);
  });
});

describe("EP de 6 titres, 2 singles, 1 clip", () => {
  const EP_DATE = "2027-03-03";
  const tracks = [1, 2, 3, 4, 5, 6].map((i) => ({
    key: `t${i}`,
    title: `Titre ${i}`,
    isSingle: i <= 2,
    singleReleaseDate: null,
    hasClip: i === 2,
    clipReleaseDate: null,
  }));
  const plan = generatePlan({ type: "ep", releaseDate: EP_DATE, platforms: ALL, ownedAssets: [], adminEnabled: true, tracks }, config, TODAY);
  const t = byKey(plan);

  test("dates proposées des singles : J-21 puis tous les 28 jours avant", () => {
    assert.deepEqual(proposeSingleDates(config, EP_DATE, 2), ["2027-01-13", "2027-02-10"]);
    assert.equal(t["single_release_post@t1"].dueDate, "2027-01-13");
    assert.equal(t["clip_release@t2"].dueDate, "2027-02-10");
    assert.equal(t.ep_release.dueDate, EP_DATE);
  });

  test("chaque single a son planning, étiqueté avec son titre", () => {
    assert.equal(t["single_master_cover@t1"].trackTitle, "Titre 1");
    assert.equal(t["single_master_cover@t1"].anchorDate, "2027-01-13");
    assert.equal(t["single_master_cover@t2"].anchorDate, "2027-02-10");
  });

  test("l'après-sortie d'un single s'arrête à la sortie suivante", () => {
    for (const task of plan.tasks.filter((x) => x.anchorDate === "2027-01-13" && x.offsetDays >= 0)) assert.ok(task.dueDate < "2027-02-10", task.key);
    for (const task of plan.tasks.filter((x) => x.anchorDate === "2027-02-10" && x.offsetDays >= 0)) assert.ok(task.dueDate < EP_DATE, task.key);
    assert.equal(t["single_last_push@t1"], undefined);
  });

  test("le clip du single 2 est fusionné avec son planning", () => {
    assert.equal(t["single_release_post@t2"], undefined);
    assert.ok(t["clip_shoot@t2"] && t["clip_teaser_1@t2"]);
  });

  test("tâches par titre : extraits des 4 inédits, track-by-track des 6 titres", () => {
    const snippets = plan.tasks.filter((x) => x.templateTaskId === "ep_unreleased_snippets");
    assert.deepEqual(snippets.map((x) => x.trackKey).sort(), ["t3", "t4", "t5", "t6"]);
    assert.ok(snippets.every((x) => x.dueDate < EP_DATE));
    const tbt = plan.tasks.filter((x) => x.templateTaskId === "ep_track_by_track");
    assert.equal(tbt.length, 6);
    assert.deepEqual(tbt.map((x) => x.offsetDays), [2, 4, 6, 8, 10, 12]);
    assert.equal(tbt[0].title, "Track-by-track : Titre 1");
  });

  test("planning cohérent", () => {
    assert.equal(plan.mode, "confort");
    assert.deepEqual(plan.warnings, []);
    checkInvariants(plan);
  });

  test("single trop proche d'aujourd'hui : avertissement", () => {
    const soon = generatePlan(
      { type: "ep", releaseDate: addDays(TODAY, 25), platforms: ALL, ownedAssets: [], adminEnabled: true, tracks },
      config,
      TODAY,
    );
    assert.ok(codes(soon).includes("single_too_soon"));
    checkInvariants(soon);
  });
});

describe("Recalage", () => {
  const input = { type: "single", releaseDate: addDays(TODAY, 30), platforms: ALL, ownedAssets: [], adminEnabled: true };
  const initial = generatePlan(input, config, TODAY);
  const existing = initial.tasks.map((t) => ({ id: `id-${t.key}`, key: t.key, status: "a_produire", dueDate: t.dueDate, dateLocked: false }));
  const find = (key) => existing.find((t) => t.key === key);
  find("single_teaser_1").status = "pret";
  find("single_release_post").status = "publie";
  Object.assign(find("single_announce"), { dateLocked: true, dueDate: "2026-11-20" });
  existing.push({ id: "manuelle", key: null, status: "a_produire", dueDate: "2026-11-10", dateLocked: true });
  const later = { ...input, releaseDate: addDays(input.releaseDate, 14) };

  test("report de 2 semaines : tâches déplacées, bonus ajoutées, rien de retiré", () => {
    const preview = reschedule(existing, later, config, TODAY, { dismissedKeys: ["single_lyrics_video"] });
    assert.equal(preview.plan.mode, "confort");
    const moved = new Map(preview.moves.map((m) => [m.key, m]));
    assert.ok(moved.has("single_teaser_1"), "tâche « Prêt » déplacée, statut conservé");
    assert.ok(!moved.has("single_release_post"), "tâche publiée non déplacée");
    assert.ok(!moved.has("single_announce"), "tâche verrouillée non déplacée");
    assert.ok(preview.moves.every((m) => m.id !== "manuelle"));
    assert.equal(moved.get("single_update_bios").to, later.releaseDate);
    assert.ok(preview.moves.every((m) => !("status" in m)), "le recalage ne touche pas aux statuts");
    assert.deepEqual(
      preview.additions.map((a) => a.key).sort(),
      ["single_listening_live", "single_reminder_tomorrow", "single_trend_prep", "single_fan_reposts"].sort(),
      "bonus ajoutées, sauf celle supprimée par l'artiste",
    );
    assert.deepEqual(preview.removals, []);
    assert.equal(preview.lockedSkipped, 1);
    assert.equal(preview.summary, `${preview.moves.length} tâches déplacées, 4 ajoutées, 0 retirée`);
  });

  test("case « recaler aussi les tâches déplacées »", () => {
    const preview = reschedule(existing, later, config, TODAY, { includeLocked: true });
    assert.ok(preview.moves.some((m) => m.key === "single_announce"));
    assert.equal(preview.lockedSkipped, 0);
  });

  test("sortie avancée : tâches non commencées retirées, tâches commencées gardées", () => {
    const sooner = { ...input, releaseDate: addDays(TODAY, 5) };
    const preview = reschedule(existing, sooner, config, TODAY);
    const removed = preview.removals.map((r) => r.key);
    assert.ok(removed.includes("single_sacem"), "recommandée non commencée retirée en mode Urgence");
    assert.ok(!removed.includes("single_teaser_1"), "tâche « Prêt » jamais retirée");
    assert.ok(preview.moves.every((m) => m.key !== "single_release_post"));
  });

  test("phrase d'aperçu", () => {
    assert.equal(summarize(12, 2, 1), "12 tâches déplacées, 2 ajoutées, 1 retirée");
    assert.equal(summarize(0, 0, 0), "Aucun changement dans le planning.");
  });
});
