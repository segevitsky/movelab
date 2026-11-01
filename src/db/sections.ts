/**
 * Saved sections ("save the warm-up"): pure helpers shared by Today (generated workout) and the saved-workout
 * screen. A saved section is a fixed, ordered list of drills; applying it to a workout section replaces
 * that section's items for every round with slot ids the framework does not know (`bank-<n>`), which the
 * timeline plays in insertion order after the framework's own slots.
 */
import type { SectionDrill, WorkoutItem } from './types';

export const BANK_SLOT = 'bank-';

/** The fixed drills of a workout section (round 1, play order: framework slots first, then extras). */
export function sectionDrills(items: WorkoutItem[], blockId: string, slotOrder: string[]): SectionDrill[] {
  const round1 = items.filter((i) => i.blockId === blockId && i.round === 1);
  const known = round1.filter((i) => slotOrder.includes(i.slotId)).sort((a, b) => slotOrder.indexOf(a.slotId) - slotOrder.indexOf(b.slotId));
  const extras = round1.filter((i) => !slotOrder.includes(i.slotId));
  return [...known, ...extras].map((i) => ({ exerciseId: i.exerciseId, dosage: i.dosage }));
}

/** Replace one section's items (all rounds) with the saved drills; other sections untouched. */
export function applySection(items: WorkoutItem[], blockId: string, rounds: number, drills: SectionDrill[]): WorkoutItem[] {
  const rest = items.filter((i) => i.blockId !== blockId);
  const added: WorkoutItem[] = [];
  for (let r = 1; r <= Math.max(1, rounds); r++) {
    drills.forEach((d, n) => added.push({ blockId, slotId: `${BANK_SLOT}${n + 1}`, round: r, exerciseId: d.exerciseId, dosage: d.dosage, locked: true }));
  }
  return [...rest, ...added];
}
