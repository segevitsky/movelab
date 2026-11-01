import { describe, expect, it } from 'vitest';
import { applySection, sectionDrills } from './sections';
import type { WorkoutItem } from './types';

const d = (v: number) => ({ type: 'time' as const, value: v });
const items: WorkoutItem[] = [
  { blockId: 'warmup', slotId: 'w2', round: 1, exerciseId: 'b', dosage: d(45) },
  { blockId: 'warmup', slotId: 'w1', round: 1, exerciseId: 'a', dosage: d(90) },
  { blockId: 'warmup', slotId: 'extra-1', round: 1, exerciseId: 'c', dosage: d(30) },
  { blockId: 'rounds', slotId: 'r1', round: 1, exerciseId: 'x', dosage: d(40) },
  { blockId: 'rounds', slotId: 'r1', round: 2, exerciseId: 'x', dosage: d(40) },
];

describe('saved sections', () => {
  it('reads a section in play order: framework slots first, then extras', () => {
    expect(sectionDrills(items, 'warmup', ['w1', 'w2']).map((x) => x.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('replaces one section for every round and leaves the others alone', () => {
    const out = applySection(items, 'rounds', 3, [{ exerciseId: 'p', dosage: d(20) }, { exerciseId: 'q', dosage: d(25) }]);
    expect(out.filter((i) => i.blockId === 'warmup')).toHaveLength(3);
    const r = out.filter((i) => i.blockId === 'rounds');
    expect(r).toHaveLength(6);
    expect(r.map((i) => `${i.round}:${i.slotId}:${i.exerciseId}`)).toEqual(['1:bank-1:p', '1:bank-2:q', '2:bank-1:p', '2:bank-2:q', '3:bank-1:p', '3:bank-2:q']);
    expect(r.every((i) => i.locked)).toBe(true);
  });
});
