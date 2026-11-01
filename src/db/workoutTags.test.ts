import { describe, expect, it } from 'vitest';
import { suggestWorkoutTags } from './workoutRepo';

describe('suggestWorkoutTags', () => {
  it('ranks the most frequent drill slots, ignores warm-up/cool-down, adds upper for push+pull', () => {
    const byId = new Map([
      ['a', { slots: ['warmup', 'mobility'] }],
      ['b', { slots: ['push', 'strength'] }],
      ['c', { slots: ['pull'] }],
      ['d', { slots: ['legs'] }],
      ['e', { slots: ['legs', 'cardio'] }],
    ] as const) as Map<string, { slots: readonly string[] }>;
    const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ blockId: 'x', slotId: String(i), round: 1, exerciseId: id, dosage: { type: 'time' as const, value: 30 } }));
    const tags = suggestWorkoutTags(items, byId as never, 4);
    expect(tags[0]).toBe('legs');
    expect(tags).toContain('upper');
    expect(tags).not.toContain('warmup');
    expect(suggestWorkoutTags([...items, ...items.map((i) => ({ ...i, round: 2 }))], byId as never)[0]).toBe('legs');
  });
});
