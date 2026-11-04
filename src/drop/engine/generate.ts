// Drop : moteur de planning. Fonction pure et déterministe : mêmes entrées, même planning.
// Aucune règle métier ici : seuils, modèles et textes viennent de la configuration (src/drop/config).
import { phaseFor, platformsFor, type DropConfig } from "../config/index";
import type { Mode, ModeId, PhaseId, PriorityId, TaskTemplate } from "../config/schema";
import { addDays, diffDays, jLabel } from "./dates";
import type { Plan, PlanInput, PlannedTask, PlanWarning, TrackInput } from "./types";

const PRIORITY_RANK: Record<PriorityId, number> = { essentielle: 0, recommandee: 1, bonus: 2 };
const days = (n: number) => `${n} jour${Math.abs(n) > 1 ? "s" : ""}`;

/** Mode retenu selon le délai D (jours avant la sortie). */
export function modeFor(config: DropConfig, daysLeft: number): Mode {
  const mode = config.settings.modes.find((m) => m.minDays === null || daysLeft >= m.minDays);
  return mode ?? config.settings.modes[config.settings.modes.length - 1];
}

const included = (mode: Mode, task: TaskTemplate) =>
  mode.includes.some((i) => i.priority === task.priority && (!i.modules || i.modules.includes(task.module)));

/** EP/Album : dates proposées pour les singles extraits (le dernier à J-21 de l'EP, puis tous les 28 jours avant). */
export function proposeSingleDates(config: DropConfig, projectDate: string, count: number): string[] {
  const { lastSingleOffset, singleSpacingDays } = config.settings.ep;
  return Array.from({ length: count }, (_, i) => addDays(projectDate, lastSingleOffset - (count - 1 - i) * singleSpacingDays));
}

// --- Un « sous-plan » = un modèle appliqué à une date J0 ----------------------------------

interface SubPlan {
  anchor: string;
  templates: TaskTemplate[];
  track: TrackInput | null;
  /** Les tâches d'après-sortie s'arrêtent à cette date (single suivant ou EP). */
  stopAt: string | null;
  /** Titres pour les tâches « par titre » (modèle EP). */
  perTrack?: { all: TrackInput[]; unreleased: TrackInput[] };
}

/** Tâche en cours de placement. */
interface Draft {
  tpl: TaskTemplate;
  key: string;
  track: TrackInput | null;
  title: string;
  phase: PhaseId;
  ideal: number;
  min: number | null;
  anchor: string;
  order: number;
  offset: number;
  /** Placée aujourd'hui faute de temps : ne bouge plus au lissage. */
  pinned: boolean;
  alert: string | null;
  /** Date la plus tardive autorisée au lissage. */
  latest: string | null;
}

interface Ctx {
  config: DropConfig;
  input: PlanInput;
  today: string;
  warnings: PlanWarning[];
  order: number;
}

function withoutReplaced(templates: TaskTemplate[]) {
  const replaced = new Set(templates.map((t) => t.replaces).filter(Boolean));
  return templates.filter((t) => !replaced.has(t.id));
}

/** Copies « par titre » d'une tâche du modèle EP. */
function expand(sub: SubPlan, tpl: TaskTemplate, ctx: Ctx): { tpl: TaskTemplate; track: TrackInput | null; ideal: number; min: number | null }[] {
  if (!tpl.perTrack || !sub.perTrack) return [{ tpl, track: sub.track, ideal: tpl.idealOffset, min: tpl.minOffset }];
  const tracks = sub.perTrack[tpl.perTrack];
  const step = ctx.config.settings.ep.perTrackSpacingDays;
  const n = tracks.length;
  return tracks.map((track, i) => {
    // Avant la sortie, les copies finissent au J idéal ; après, elles y commencent.
    const shift = tpl.idealOffset < 0 ? -(n - 1 - i) * step : i * step;
    return { tpl, track, ideal: tpl.idealOffset + shift, min: tpl.minOffset === null ? null : tpl.minOffset + shift };
  });
}

function planSub(sub: SubPlan, ctx: Ctx): Draft[] {
  const { config, input, today } = ctx;
  const D = diffDays(today, sub.anchor);
  const mode = modeFor(config, D);
  const defaultIfTooLate = config.settings.defaultIfTooLate;

  // Étape 2 : filtrer.
  const drafts: Draft[] = [];
  for (const tpl of sub.templates) {
    if (tpl.module === "admin" && !input.adminEnabled) continue;
    const platforms = platformsFor(config, tpl);
    if (platforms.length > 0 && !platforms.some((p) => input.platforms.includes(p))) continue;
    if (!included(mode, tpl)) continue;
    for (const copy of expand(sub, tpl, ctx)) {
      const trackSuffix = copy.track ? `@${copy.track.key}` : "";
      drafts.push({
        tpl,
        key: `${tpl.id}${trackSuffix}`,
        track: copy.track,
        title: tpl.perTrack && copy.track ? `${tpl.title} : ${copy.track.title}` : tpl.title,
        phase: phaseFor(config, tpl.idealOffset),
        ideal: copy.ideal,
        min: copy.min,
        anchor: sub.anchor,
        order: ctx.order++,
        offset: copy.ideal,
        pinned: false,
        alert: null,
        latest: null,
      });
    }
  }

  const pre = drafts.filter((d) => d.ideal < 0);
  const post = drafts.filter((d) => d.ideal >= 0);
  const kept: Draft[] = [];

  // Sortie passée : on ne garde que l'après-sortie encore à venir (étape 6).
  if (D >= 0) {
    // Étape 4 : tâches devenues impossibles.
    const feasible: Draft[] = [];
    for (const d of pre) {
      const min = Math.abs(d.min ?? d.ideal);
      if (min <= D) {
        feasible.push(d);
        continue;
      }
      const label = d.track && !d.tpl.perTrack ? ` (${d.track.title})` : "";
      if ((d.tpl.ifTooLate ?? defaultIfTooLate) === "drop") {
        ctx.warnings.push({
          code: "too_late_dropped",
          taskKey: d.key,
          message: `« ${d.title} »${label} demande au moins ${days(min)} avant la sortie : avec ${days(D)}, ce n'est plus possible.`,
        });
      } else {
        d.offset = -D;
        d.pinned = true;
        d.alert = d.tpl.lateAlert ?? `À faire au plus vite : cette étape devait être faite au plus tard à ${jLabel(-min)}.`;
        ctx.warnings.push({ code: "too_late_today", taskKey: d.key, message: `« ${d.title} »${label} est prévue aujourd'hui. ${d.alert}` });
        kept.push(d);
      }
    }

    // Étape 3 : placer, en resserrant si le délai est plus court que le modèle.
    const M = Math.max(0, ...feasible.map((d) => Math.abs(d.ideal)));
    const f = M > D ? D / M : 1;
    for (const d of feasible) {
      const min = Math.abs(d.min ?? d.ideal);
      d.offset = f === 1 ? d.ideal : -Math.max(min, Math.round(Math.abs(d.ideal) * f));
      d.latest = addDays(d.anchor, Math.min(-1, d.min ?? d.ideal));
      kept.push(d);
    }
  }

  // Étape 6 : après la sortie, jamais resserré.
  const truncate = ctx.config.settings.ep.truncatePostReleaseAtNextRelease;
  for (const d of post) {
    const date = addDays(d.anchor, d.offset);
    if (date < today) continue;
    if (truncate && sub.stopAt && date >= sub.stopAt) continue;
    kept.push(d);
  }
  return kept;
}

// --- Étape 5 : lisser la charge des tâches réseaux ------------------------------------------

function smooth(drafts: Draft[], ctx: Ctx) {
  const max = ctx.config.settings.maxSocialTasksPerDay;
  const social = drafts.filter((d) => d.tpl.module === "reseaux");
  const dateOf = (d: Draft) => addDays(d.anchor, d.offset);
  const count = (date: string) => social.filter((d) => dateOf(d) === date).length;
  const movable = (d: Draft) => d.ideal < 0 && !d.pinned && d.latest !== null;
  const stuck = new Set<string>();

  for (let guard = 0; guard < 1000; guard++) {
    const counts = new Map<string, number>();
    for (const d of social) counts.set(dateOf(d), (counts.get(dateOf(d)) ?? 0) + 1);
    const day = [...counts.entries()].filter(([date, n]) => n > max && !stuck.has(date)).map(([date]) => date).sort()[0];
    if (!day) return;

    // La moins prioritaire d'abord, puis la plus tardive dans le modèle.
    const candidates = social
      .filter((d) => dateOf(d) === day && movable(d))
      .sort((a, b) => PRIORITY_RANK[b.tpl.priority] - PRIORITY_RANK[a.tpl.priority] || b.order - a.order);

    let moved = false;
    for (const d of candidates) {
      const earliest = ctx.today;
      const latest = d.latest!;
      // Jour libre le plus proche, entre aujourd'hui et la date limite de la tâche (à égalité : le plus tôt).
      for (let dist = 1; dist <= 400 && !moved; dist++) {
        for (const target of [addDays(day, -dist), addDays(day, dist)]) {
          if (target < earliest || target > latest) continue;
          if (count(target) < max) {
            d.offset = diffDays(d.anchor, target);
            moved = true;
            break;
          }
        }
        if (addDays(day, -dist) < earliest && addDays(day, dist) > latest) break;
      }
      if (moved) break;
    }
    if (!moved) {
      stuck.add(day);
      const first = social.find((d) => dateOf(d) === day)!;
      ctx.warnings.push({
        code: "overload",
        message: `${count(day)} contenus réseaux tombent le même jour (${jLabel(diffDays(first.anchor, day))}) : pas de jour libre pour en décaler un.`,
      });
    }
  }
}

// --- Construction des sous-plans selon le type de sortie ------------------------------------

function subPlans(input: PlanInput, ctx: Ctx): SubPlan[] {
  const { single, clip, ep } = ctx.config.templates;
  if (input.type === "single") return [{ anchor: input.releaseDate, templates: single.tasks, track: null, stopAt: null }];
  if (input.type === "clip") {
    const templates = input.clipIsRelaunch ? clip.tasks : withoutReplaced([...single.tasks, ...clip.tasks]);
    return [{ anchor: input.releaseDate, templates, track: null, stopAt: null }];
  }

  // EP / Album : un planning par single extrait, un pour le projet, un par clip.
  const project = input.releaseDate;
  const tracks = input.tracks ?? [];
  const singles = tracks.filter((t) => t.isSingle);
  const proposed = proposeSingleDates(ctx.config, project, singles.length);
  const singleDates = new Map(singles.map((t, i) => [t.key, t.singleReleaseDate ?? proposed[i]]));
  const ordered = [...singles].sort((a, b) => singleDates.get(a.key)!.localeCompare(singleDates.get(b.key)!));

  const plans: SubPlan[] = [];
  ordered.forEach((track, i) => {
    const date = singleDates.get(track.key)!;
    const next = i + 1 < ordered.length ? singleDates.get(ordered[i + 1].key)! : project;
    const sameDayClip = track.hasClip && (track.clipReleaseDate ?? date) === date;
    const templates = sameDayClip ? withoutReplaced([...single.tasks, ...clip.tasks]) : single.tasks;
    plans.push({ anchor: date, templates, track, stopAt: next });

    if (date >= project) {
      ctx.warnings.push({ code: "single_after_project", message: `Le single « ${track.title} » sort le jour du projet ou après : avance sa date.` });
    }
    const soon = diffDays(ctx.today, date);
    if (date < project && soon < ctx.config.settings.ep.minDaysBeforeSingle) {
      ctx.warnings.push({
        code: "single_too_soon",
        message:
          soon < 0
            ? `Le single « ${track.title} » serait déjà sorti : réduis le nombre de singles extraits ou choisis une autre date.`
            : `Le single « ${track.title} » sort dans ${days(soon)} : c'est très court. Tu peux réduire le nombre de singles extraits.`,
      });
    }
  });

  const singleKeys = new Set(singles.map((t) => t.key));
  plans.push({
    anchor: project,
    templates: ep.tasks,
    track: null,
    stopAt: null,
    perTrack: { all: tracks, unreleased: tracks.filter((t) => !singleKeys.has(t.key)) },
  });

  for (const track of tracks) {
    if (!track.hasClip) continue;
    const singleDate = singleDates.get(track.key);
    const date = track.clipReleaseDate ?? singleDate ?? project;
    if (singleDate && date === singleDate) continue; // déjà fusionné avec le single
    plans.push({ anchor: date, templates: clip.tasks.map((t) => ({ ...t, replaces: undefined })), track, stopAt: null });
  }
  return plans;
}

/**
 * Génère le planning d'une sortie.
 * @param today date du jour à Paris (« AAAA-MM-JJ »), voir todayInParis().
 */
export function generatePlan(input: PlanInput, config: DropConfig, today: string): Plan {
  const ctx: Ctx = { config, input, today, warnings: [], order: 0 };
  const daysLeft = diffDays(today, input.releaseDate);
  const mode: ModeId = modeFor(config, daysLeft).id;

  if (daysLeft < 0) {
    ctx.warnings.push({
      code: "past_release",
      message: "Ta date de sortie est passée : seules les étapes d'après-sortie encore à venir sont prévues, à partir d'aujourd'hui.",
    });
  }

  const drafts = subPlans(input, ctx).flatMap((sub) => planSub(sub, ctx));
  smooth(drafts, ctx);

  const owned = new Set(input.ownedAssets);
  const tasks: PlannedTask[] = drafts
    .map((d) => ({ d, dueDate: addDays(d.anchor, d.offset) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.d.order - b.d.order)
    .map(({ d, dueDate }) => ({
      key: d.key,
      templateTaskId: d.tpl.id,
      trackKey: d.track?.key ?? null,
      trackTitle: d.track?.title ?? null,
      title: d.title,
      phase: d.phase,
      module: d.tpl.module,
      priority: d.tpl.priority,
      platforms: platformsFor(config, d.tpl).filter((p) => input.platforms.includes(p)),
      formats: [...d.tpl.formats],
      status: d.tpl.readyIf && owned.has(d.tpl.readyIf) ? "pret" : "a_produire",
      dueDate,
      anchorDate: d.anchor,
      offsetDays: d.offset,
      idea: d.tpl.idea,
      why: d.tpl.why,
      how: [...d.tpl.how],
      alert: d.alert,
    }));

  return { mode, daysLeft, tasks, warnings: ctx.warnings };
}
