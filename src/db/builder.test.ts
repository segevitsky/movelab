import { describe, expect, it } from 'vitest';
import { buildWorkout, ownSections, placedOf, reorderDrills, SHAPES } from './builder';
import type { FrameworkBlocks, WorkoutItem } from './types';

const t = (v: number) => ({ type: 'time' as const, value: v });

describe('workout builder', () => {
  it('builds one slot per drill and items for every round', () => {
    const { blocks, items } = buildWorkout([SHAPES.warmup, { ...SHAPES.rounds, rounds: 2 }], { b1: [{ exerciseId: 'a', dosage: t(60) }], b2: [{ exerciseId: 'x', dosage: t(40) }, { exerciseId: 'y', dosage: t(30) }] });
    expect(blocks.blocks.map((b) => `${b.id}:${b.kind}:${b.slots.length}`)).toEqual(['b1:sequence:1', 'b2:rounds:2']);
    expect(items.filter((i) => i.blockId === 'b2')).toHaveLength(4);
    expect(items.map((i) => `${i.blockId}/${i.slotId}/${i.round}/${i.exerciseId}`)).toEqual(['b1/d1/1/a', 'b2/d1/1/x', 'b2/d2/1/y', 'b2/d1/2/x', 'b2/d2/2/y']);
  });

  it('reads a framework section in play order, extras last, and takes ownership', () => {
    const fw: FrameworkBlocks = { blocks: [{ id: 'w', name: 'Warm-up', kind: 'sequence', seconds: 360, slots: [{ id: 's1', tags: ['warmup'] }, { id: 's2', tags: ['mobility'] }] }] };
    const items: WorkoutItem[] = [
      { blockId: 'w', slotId: 's2', round: 1, exerciseId: 'b', dosage: t(45) },
      { blockId: 'w', slotId: 's1', round: 1, exerciseId: 'a', dosage: t(90) },
      { blockId: 'w', slotId: 'bank-1', round: 1, exerciseId: 'c', dosage: t(30) },
    ];
    expect(placedOf(fw, items, 'w').map((p) => p.exerciseId)).toEqual(['a', 'b', 'c']);
    const own = ownSections(fw, items);
    expect(own.blocks.blocks[0].slots.map((s) => s.id)).toEqual(['d1', 'd2', 'd3']);
    expect(own.blocks.blocks[0].seconds).toBe(360);
    expect(own.items.map((i) => i.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('reorders drills within a section for every round', () => {
    const { blocks, items } = buildWorkout([{ ...SHAPES.rounds, rounds: 2 }], { b1: [{ exerciseId: 'x', dosage: t(1) }, { exerciseId: 'y', dosage: t(2) }, { exerciseId: 'z', dosage: t(3) }] });
    const r = reorderDrills(blocks, items, 'b1', 2, 0);
    expect(placedOf(r.blocks, r.items, 'b1').map((p) => p.exerciseId)).toEqual(['z', 'x', 'y']);
    expect(r.items.filter((i) => i.round === 2).map((i) => i.exerciseId)).toEqual(['z', 'x', 'y']);
    expect(r.blocks.blocks[0].rounds).toBe(2);
  });
});
