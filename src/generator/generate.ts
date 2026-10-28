/**
 * Architecture §6. Fills a framework's slots from the library with a scored softmax sample.
 * Deterministic for a given seed; `swap()` re-samples one slot with the rest fixed.
 */
import type { FrameworkBlock, FrameworkSlot } from '../db/types';
import type { Dosage, Slot } from '../db/vocab';
import { poseDistance } from '../pipeline/features';
import { pairingWeight } from './pairing';
import { mulberry32 } from './rng';
import { slotKey, type GenContext, type GenExercise, type GenItem, type GenWorkout } from './types';

export const WEIGHTS = { pairing: 1.0, flow: 0.8, recency: 3.0, muscleClash: 1.2, focus: 1.5 };
const TRANSITION_SEC = 5;

export function itemSeconds(ex: GenExercise | undefined, dosage: Dosage): number {
  if (dosage.type === 'time') return dosage.value * (dosage.perSide ? 2 : 1);
  const perRep = ex?.repSeconds && ex.repSeconds > 0.8 ? ex.repSeconds : 3;
  return Math.round(dosage.value * perRep * (dosage.perSide ? 2 : 1));
}

function candidatesFor(slot: FrameworkSlot, ctx: GenContext): GenExercise[] {
  const have = ctx.inputs.equipment;
  return ctx.library.filter((e) => {
    if (e.archived) return false;
    if (ctx.excluded?.includes(e.id)) return false;
    if (!slot.tags.some((t) => e.slots.includes(t))) return false;
    if (have && !e.equipment.every((q) => q === 'none' || have.includes(q))) return false;
    return true;
  });
}

function recentSets(ctx: GenContext, n = 3): Set<string>[] {
  return ctx.history.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, n).map((h) => new Set(h.exerciseIds));
}

function score(ex: GenExercise, picksSoFar: GenExercise[], roundPicks: GenExercise[], ctx: GenContext, recent: Set<string>[], slot: FrameworkSlot): number {
  let s = 0;
  const prev = picksSoFar[picksSoFar.length - 1];
  for (const p of picksSoFar) s += WEIGHTS.pairing * Math.min(3, pairingWeight(ctx.pairings, p.id, ex.id));
  if (prev?.endPose && ex.startPose) s += WEIGHTS.flow * (1 - Math.min(1, poseDistance(prev.endPose, ex.startPose) / 2));
  recent.forEach((set, i) => { if (set.has(ex.id)) s -= WEIGHTS.recency * (1 - i * 0.25); });
  for (const p of roundPicks) {
    const clash = ex.primaryMuscles.filter((m) => p.primaryMuscles.includes(m)).length;
    if (clash) s -= WEIGHTS.muscleClash * clash;
  }
  if (ctx.inputs.focus && (ex.slots.includes(ctx.inputs.focus) || slot.tags.includes(ctx.inputs.focus))) s += WEIGHTS.focus;
  if (ctx.inputs.energy === 'low' && ex.slots.includes('cardio')) s -= 1;
  if (ctx.inputs.energy === 'high' && ex.slots.includes('cardio')) s += 0.5;
  return s;
}

function sample<T>(items: T[], scores: number[], temperature: number, rnd: () => number): T {
  const max = Math.max(...scores);
  const w = scores.map((s) => Math.exp((s - max) / temperature));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function dosageFor(slot: FrameworkSlot, ex: GenExercise): Dosage {
  return slot.dosage ?? ex.dosageDefault ?? { type: 'time', value: 45 };
}

/** Generate a workout. Locked picks (ctx.locked) are kept; the rest is sampled in order. */
export function generate(ctx: GenContext): GenWorkout {
  const rnd = mulberry32(ctx.seed);
  const T = 0.2 + (Math.min(1, Math.max(0, ctx.inputs.surprise ?? 0.3))) * 1.3;
  const recent = recentSets(ctx);
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const activeGoal = ctx.goals.find((g) => g.active && g.exerciseId && byId.has(g.exerciseId));
  const items: GenItem[] = [];
  const unfilled: GenWorkout['unfilled'] = [];
  const picksSoFar: GenExercise[] = [];
  const usedIds = new Set<string>();

  for (const block of ctx.blocks.blocks) {
    const roundPicks: GenExercise[] = [];
    const chosen: (GenExercise | null)[] = [];
    for (const slot of block.slots) {
      const key = slotKey(block.id, slot.id);
      let pick: GenExercise | null = null;
      const lockedId = ctx.locked?.[key];
      if (lockedId && byId.has(lockedId)) pick = byId.get(lockedId)!;
      else if (slot.isSkill && activeGoal && !usedIds.has(activeGoal.exerciseId!)) pick = byId.get(activeGoal.exerciseId!)!;
      else {
        let cands = candidatesFor(slot, ctx).filter((e) => !usedIds.has(e.id));
        // never repeat something from the last 3 workouts when there is an alternative
        const fresh = cands.filter((e) => !recent.some((set) => set.has(e.id)));
        if (fresh.length > 0) cands = fresh;
        if (cands.length === 0) {
          if (!slot.optional) unfilled.push({ blockId: block.id, slotId: slot.id, tags: slot.tags });
          chosen.push(null);
          continue;
        }
        const scores = cands.map((e) => score(e, picksSoFar, roundPicks, ctx, recent, slot));
        pick = sample(cands, scores, T, rnd);
      }
      chosen.push(pick);
      usedIds.add(pick.id);
      picksSoFar.push(pick);
      roundPicks.push(pick);
    }
    const rounds = block.kind === 'rounds' ? Math.max(1, block.rounds ?? 1) : 1;
    for (let r = 1; r <= rounds; r++) {
      block.slots.forEach((slot, i) => {
        const ex = chosen[i];
        if (!ex) return;
        const dosage = dosageFor(slot, ex);
        items.push({ blockId: block.id, slotId: slot.id, round: r, exerciseId: ex.id, dosage, seconds: itemSeconds(ex, dosage), locked: !!ctx.locked?.[slotKey(block.id, slot.id)] });
      });
    }
  }
  let w: GenWorkout = { frameworkId: ctx.frameworkId, seed: ctx.seed, inputs: ctx.inputs, items, unfilled, totalSeconds: 0, why: '' };
  w = fitTime(w, ctx);
  w.totalSeconds = totalSeconds(w, ctx.blocks.blocks);
  w.why = explain(w, ctx);
  return w;
}

/** Work + transitions + rests, per Architecture §6 / the framework's rest fields. */
export function totalSeconds(w: GenWorkout, blocks: FrameworkBlock[]): number {
  let total = 0;
  for (const b of blocks) {
    const its = w.items.filter((i) => i.blockId === b.id);
    if (its.length === 0) continue;
    const rounds = b.kind === 'rounds' ? Math.max(1, b.rounds ?? 1) : 1;
    const perRound = its.filter((i) => i.round === 1);
    const work = perRound.reduce((s, i) => s + i.seconds, 0);
    const between = (b.restBetweenExercisesSec ?? 0) + TRANSITION_SEC;
    total += rounds * (work + Math.max(0, perRound.length - 1) * between) + Math.max(0, rounds - 1) * (b.restBetweenRoundsSec ?? 0);
  }
  return total;
}

/** Scale dosages (0.5×…1.5×) and drop optional slots to land within ±10 % of the time budget. */
export function fitTime(w: GenWorkout, ctx: GenContext): GenWorkout {
  const target = ctx.inputs.timeAvailableMin ? ctx.inputs.timeAvailableMin * 60 : null;
  if (!target) return w;
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  let items = w.items.map((i) => ({ ...i }));
  const current = () => totalSeconds({ ...w, items }, ctx.blocks.blocks);
  // 1. drop optional slots if over budget
  if (current() > target * 1.1) {
    const optionalKeys = new Set<string>();
    for (const b of ctx.blocks.blocks) for (const s of b.slots) if (s.optional) optionalKeys.add(slotKey(b.id, s.id));
    for (const k of optionalKeys) {
      if (current() <= target * 1.1) break;
      items = items.filter((i) => slotKey(i.blockId, i.slotId) !== k);
    }
  }
  // 2. scale dosages
  const base = current();
  if (base > 0) {
    const f = Math.min(1.5, Math.max(0.5, target / base));
    if (Math.abs(1 - f) > 0.02) {
      items = items.map((i) => {
        const ex = byId.get(i.exerciseId);
        const value = i.dosage.type === 'time' ? Math.max(10, Math.round((i.dosage.value * f) / 5) * 5) : Math.max(3, Math.round(i.dosage.value * f));
        const dosage = { ...i.dosage, value };
        return { ...i, dosage, seconds: itemSeconds(ex, dosage) };
      });
    }
  }
  return { ...w, items };
}

/** Re-sample one slot with everything else locked (Architecture §6 "swap"). */
export function swap(ctx: GenContext, current: GenWorkout, blockId: string, slotId: string, attempt = 1): GenWorkout {
  const key = slotKey(blockId, slotId);
  const locked: Record<string, string> = { ...(ctx.locked ?? {}) };
  for (const it of current.items) if (slotKey(it.blockId, it.slotId) !== key) locked[slotKey(it.blockId, it.slotId)] = it.exerciseId;
  const old = current.items.find((i) => slotKey(i.blockId, i.slotId) === key)?.exerciseId;
  const excluded = [...(ctx.excluded ?? []), ...(old ? [old] : [])];
  return generate({ ...ctx, locked, excluded, seed: ctx.seed + 1000 * attempt + 7 });
}

/** One sentence of "why", rule-based (no LLM). */
export function explain(w: GenWorkout, ctx: GenContext): string {
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const parts: string[] = [];
  const slotsUsed = new Set<Slot>();
  for (const b of ctx.blocks.blocks) for (const s of b.slots) if (w.items.some((i) => i.blockId === b.id && i.slotId === s.id)) s.tags.slice(0, 1).forEach((t) => slotsUsed.add(t));
  const goal = ctx.goals.find((g) => g.active && g.exerciseId && w.items.some((i) => i.exerciseId === g.exerciseId));
  if (goal) parts.push(`skill slot = ${goal.name}`);
  if (ctx.inputs.focus) parts.push(`focus on ${ctx.inputs.focus}`);
  const recent = ctx.history.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  if (recent) {
    const days = Math.round((Date.now() - recent.createdAt) / 86400000);
    const recentNames = recent.exerciseIds.map((id) => byId.get(id)?.slots[0]).filter(Boolean) as Slot[];
    const avoided = [...new Set(recentNames)].filter((s) => !slotsUsed.has(s)).slice(0, 2);
    if (avoided.length) parts.push(`${avoided.join(' + ')} ${days <= 1 ? 'were yesterday' : `were ${days} days ago`}`);
    else parts.push('nothing repeated from your last 3 workouts');
  } else {
    parts.push('first workout from this library');
  }
  if (w.unfilled.length) parts.push(`no card yet for ${w.unfilled.map((u) => u.tags[0]).join(', ')}`);
  const minutes = Math.round(w.totalSeconds / 60);
  return `${[...slotsUsed].slice(0, 4).join(' + ')} today · ${parts.join(' · ')} · ≈ ${minutes} min`;
}
