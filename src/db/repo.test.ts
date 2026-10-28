import { describe, expect, it } from 'vitest';
import { filterExercises } from './repo';
import { PRESET_FRAMEWORKS, SEED_GOALS } from './seed';
import type { Exercise } from './schema';
import { SLOTS } from './vocab';

const ex = (p: Partial<Exercise>): Exercise => ({
  id: 'x', name: 'x', aliases: [], pattern: null, slots: [], equipment: [], props: [], intensity: null, primaryMuscles: [], dosageDefault: null,
  repSeconds: null, notes: null, startPose: null, endPose: null, figure: null, figureFps: null, figureFrames: null, loopStart: null, loopEnd: null,
  figure3d: null, scene: null, sourceId: null, createdAt: 0, updatedAt: 0, archived: false, ...p,
});

describe('filterExercises', () => {
  const rows = [
    ex({ id: 'a', name: 'Pull-up', pattern: 'pull', slots: ['pull', 'strength'], equipment: ['pullup-bar'] }),
    ex({ id: 'b', name: 'Push-up', aliases: ['press-up'], pattern: 'push', slots: ['push'], equipment: [] }),
    ex({ id: 'c', name: 'Bear crawl', pattern: 'locomotion', slots: ['warmup', 'locomotion'], equipment: [], archived: true }),
  ];
  it('by pattern / slot / equipment / text, hides archived by default', () => {
    expect(filterExercises(rows, {}).map((e) => e.id)).toEqual(['a', 'b']);
    expect(filterExercises(rows, { includeArchived: true }).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(filterExercises(rows, { pattern: 'push' }).map((e) => e.id)).toEqual(['b']);
    expect(filterExercises(rows, { slot: 'strength' }).map((e) => e.id)).toEqual(['a']);
    expect(filterExercises(rows, { equipment: 'none' }).map((e) => e.id)).toEqual(['b']);
    expect(filterExercises(rows, { equipment: 'pullup-bar' }).map((e) => e.id)).toEqual(['a']);
    expect(filterExercises(rows, { text: 'PRESS' }).map((e) => e.id)).toEqual(['b']);
  });
});

describe('seed data', () => {
  it('presets use known slot tags and the owner default is 3 rounds × 6 slots', () => {
    for (const f of PRESET_FRAMEWORKS) for (const b of f.blocks.blocks) for (const s of b.slots) for (const t of s.tags) expect(SLOTS).toContain(t);
    const seg = PRESET_FRAMEWORKS.find((f) => f.id === 'preset-segev-3x6')!;
    const rounds = seg.blocks.blocks.find((b) => b.kind === 'rounds')!;
    expect(rounds.rounds).toBe(3);
    expect(rounds.slots).toHaveLength(6);
    expect(rounds.slots[0].isSkill).toBe(true);
    expect(rounds.restBetweenRoundsSec).toBe(120);
  });
  it('six seed goals with ordered stages', () => {
    expect(SEED_GOALS.map((g) => g.name)).toEqual(['Pull-ups', 'Muscle-up', 'L-sit', 'Front splits', 'Knee strength', 'Crawls']);
    for (const g of SEED_GOALS) expect(g.stages.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SEED_GOALS.map((g) => g.id)).size).toBe(6);
  });
});
