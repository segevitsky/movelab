import { describe, expect, it } from 'vitest';
import { PRESET_FRAMEWORKS } from '../db/seed';
import type { Equipment, Slot } from '../db/vocab';
import { buildPairings } from './pairing';
import { dosageFactors } from './feedback';
import { generate, swap, totalSeconds } from './generate';
import { mulberry32 } from './rng';
import { slotKey, type GenContext, type GenExercise, type HistoryEntry } from './types';

const SLOT_POOL: Slot[][] = [['warmup', 'mobility'], ['locomotion', 'warmup'], ['skill'], ['strength', 'pull'], ['pull'], ['push'], ['legs'], ['core'], ['cardio'], ['stretch', 'cooldown'], ['mobility', 'cooldown']];
const EQ: Equipment[][] = [[], [], [], ['mat'], ['pullup-bar'], ['rings'], ['kettlebell']];

function makeLibrary(n: number, rnd: () => number): GenExercise[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ex${i}`, name: `Exercise ${i}`, pattern: null,
    slots: SLOT_POOL[Math.floor(rnd() * SLOT_POOL.length)],
    equipment: EQ[Math.floor(rnd() * EQ.length)],
    primaryMuscles: [],
    dosageDefault: rnd() < 0.5 ? { type: 'reps', value: 8 } : { type: 'time', value: 40 },
    repSeconds: 2 + rnd() * 3, startPose: null, endPose: null, archived: false,
  }));
}

const segev = PRESET_FRAMEWORKS.find((f) => f.id === 'preset-segev-3x6')!;
const ctxFor = (seed: number, library: GenExercise[], history: HistoryEntry[] = [], inputs: GenContext['inputs'] = {}): GenContext => ({
  frameworkId: segev.id, blocks: segev.blocks, library, pairings: [], goals: [], history, inputs, seed,
});

describe('generator properties (200 random libraries)', () => {
  const rnd = mulberry32(42);
  it('same seed → same workout; respects slot tags and equipment; never repeats recent picks when alternatives exist', () => {
    for (let trial = 0; trial < 200; trial++) {
      const lib = makeLibrary(20 + Math.floor(rnd() * 40), rnd);
      const history: HistoryEntry[] = [0, 1, 2].map((k) => ({ createdAt: Date.now() - (k + 1) * 86400000, exerciseIds: lib.filter(() => rnd() < 0.15).map((e) => e.id) }));
      const have: Equipment[] | undefined = rnd() < 0.5 ? ['mat', 'pullup-bar'] : undefined;
      const seed = Math.floor(rnd() * 1e9);
      const ctx = ctxFor(seed, lib, history, { equipment: have, surprise: rnd() });
      const a = generate(ctx);
      const b = generate(ctx);
      expect(b.items.map((i) => i.exerciseId)).toEqual(a.items.map((i) => i.exerciseId));
      const byId = new Map(lib.map((e) => [e.id, e]));
      const recent = new Set(history.flatMap((h) => h.exerciseIds));
      for (const it of a.items) {
        const ex = byId.get(it.exerciseId)!;
        const slot = segev.blocks.blocks.find((bl) => bl.id === it.blockId)!.slots.find((s) => s.id === it.slotId)!;
        expect(slot.tags.some((t) => ex.slots.includes(t))).toBe(true);
        if (have) expect(ex.equipment.every((q) => have.includes(q))).toBe(true);
        if (recent.has(ex.id)) {
          // allowed only when every alternative for that slot was also recent / used
          const alternatives = lib.filter((e) => e.id !== ex.id && slot.tags.some((t) => e.slots.includes(t)) && (!have || e.equipment.every((q) => have.includes(q))) && !recent.has(e.id) && !a.items.some((o) => o.exerciseId === e.id));
          expect(alternatives.length).toBe(0);
        }
      }
      // no exercise twice in one workout (across rounds the same slot repeats by design)
      const perRound1 = a.items.filter((i) => i.round === 1).map((i) => i.exerciseId);
      expect(new Set(perRound1).size).toBe(perRound1.length);
    }
  });

  it('hits the time budget within ±10 % when the library allows it', () => {
    const r = mulberry32(7);
    let checked = 0;
    for (let trial = 0; trial < 100; trial++) {
      const lib = makeLibrary(60, r);
      const minutes = [20, 30, 45, 60][Math.floor(r() * 4)];
      const w = generate(ctxFor(trial, lib, [], { timeAvailableMin: minutes }));
      if (w.unfilled.length > 0) continue; // the budget can't be met without cards for every slot
      const total = totalSeconds(w, segev.blocks.blocks);
      const unscaled = generate(ctxFor(trial, lib, [], {}));
      const base = totalSeconds(unscaled, segev.blocks.blocks);
      // reachable with 0.5×…1.25× scaling + optional drop (and the 120 s / 20-rep caps)?
      if (base * 0.5 <= minutes * 60 * 1.1 && base * 1.25 >= minutes * 60 * 0.9) {
        expect(Math.abs(total - minutes * 60) / (minutes * 60)).toBeLessThanOrEqual(0.1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('swap changes only the requested slot', () => {
    const r = mulberry32(99);
    const lib = makeLibrary(50, r);
    const ctx = ctxFor(5, lib);
    const w = generate(ctx);
    const target = w.items.find((i) => i.blockId === 'rounds' && i.slotId === 's3')!;
    const w2 = swap(ctx, w, 'rounds', 's3');
    const changed = w2.items.find((i) => i.blockId === 'rounds' && i.slotId === 's3')!;
    expect(changed.exerciseId).not.toBe(target.exerciseId);
    for (const it of w.items) {
      if (it.blockId === 'rounds' && it.slotId === 's3') continue;
      expect(w2.items.find((o) => o.blockId === it.blockId && o.slotId === it.slotId && o.round === it.round)?.exerciseId).toBe(it.exerciseId);
    }
  });

  it('active goal takes the skill slot; explain mentions it', () => {
    const r = mulberry32(3);
    const lib = makeLibrary(40, r);
    const ctx: GenContext = { ...ctxFor(1, lib), goals: [{ id: 'g', name: 'L-sit', exerciseId: lib[0].id, active: true }] };
    const w = generate(ctx);
    expect(w.items.find((i) => i.slotId === 's1')!.exerciseId).toBe(lib[0].id);
    expect(w.why).toContain('L-sit');
    expect(w.items.every((i) => slotKey(i.blockId, i.slotId))).toBe(true);
  });
});

describe('pairing graph', () => {
  it('co-occurrence + order from source rows', () => {
    const edges = buildPairings([
      { sourceId: 's1', exerciseId: 'a', order: 0 }, { sourceId: 's1', exerciseId: 'b', order: 1 }, { sourceId: 's1', exerciseId: 'c', order: 2 },
      { sourceId: 's2', exerciseId: 'a', order: 0 }, { sourceId: 's2', exerciseId: 'b', order: 1 },
    ]);
    const ab = edges.find((e) => e.aId === 'a' && e.bId === 'b')!;
    expect(ab.weight).toBe(2);
    expect(ab.directedWeight).toBe(2);
    expect(edges.find((e) => e.aId === 'a' && e.bId === 'c')!.weight).toBe(1);
  });
});

describe('phase 7: goals and feedback', () => {
  it('passing a stage changes the skill-slot pick; up to 3 active goals rotate', () => {
    const r = mulberry32(11);
    const lib = makeLibrary(40, r);
    const base = ctxFor(1, lib);
    const stage1 = { ...base, goals: [{ id: 'g', name: 'L-sit', exerciseId: lib[0].id, active: true }] };
    const stage2 = { ...base, goals: [{ id: 'g', name: 'L-sit', exerciseId: lib[1].id, active: true }] };
    expect(generate(stage1).items.find((i) => i.slotId === 's1')!.exerciseId).toBe(lib[0].id);
    expect(generate(stage2).items.find((i) => i.slotId === 's1')!.exerciseId).toBe(lib[1].id);
    // rotation: the goal used most recently yields to the other
    const two = { ...base, goals: [{ id: 'a', name: 'A', exerciseId: lib[2].id, active: true }, { id: 'b', name: 'B', exerciseId: lib[3].id, active: true }], history: [{ createdAt: Date.now() - 1000, exerciseIds: [lib[2].id] }] };
    expect(generate(two).items.find((i) => i.slotId === 's1')!.exerciseId).toBe(lib[3].id);
  });
  it('hard feedback reduces that drill\'s dosage by 10 %, easy raises it', () => {
    const f = dosageFactors([{ feedback: 'hard', endedAt: Date.now(), exerciseIds: ['x', 'y'] }, { feedback: 'easy', endedAt: Date.now(), exerciseIds: ['y', 'z'] }]);
    expect(f.x).toBeCloseTo(0.9);
    expect(f.y).toBeCloseTo(0.99);
    expect(f.z).toBeCloseTo(1.1);
    const r = mulberry32(5);
    const lib = makeLibrary(30, r).map((e) => ({ ...e, dosageDefault: { type: 'time' as const, value: 60 } }));
    const ctx = { ...ctxFor(2, lib), dosageFactor: { [lib[0].id]: 0.8 }, goals: [{ id: 'g', name: 'G', exerciseId: lib[0].id, active: true }] };
    const it = generate(ctx).items.find((i) => i.exerciseId === lib[0].id)!;
    expect(it.dosage.value).toBe(50); // 60 × 0.8 = 48 → rounded to 5 s
  });
});
