/**
 * Workout builder (plan Phase 10): pure helpers. A built workout owns its sections (`FrameworkBlocks` stored
 * on the workout row); every drill is its own slot, so the slot order *is* the play order. The same helpers
 * let a framework-based workout take ownership of its sections when the owner reorders drills by hand.
 */
import type { FrameworkBlock, FrameworkBlocks, FrameworkSlot, SectionDrill, WorkoutItem } from './types';
import type { Dosage, Slot } from './vocab';

export const BUILT_FRAMEWORK_ID = 'built';

export type SectionShape = { id?: string; name: string; kind: 'sequence' | 'rounds'; rounds?: number };

/** Ready-made section shapes for the wizard. */
export const SHAPES: Record<'warmup' | 'rounds' | 'finisher' | 'cooldown', SectionShape> = {
  warmup: { name: 'Warm-up', kind: 'sequence' },
  rounds: { name: 'Rounds', kind: 'rounds', rounds: 3 },
  finisher: { name: 'Finisher', kind: 'sequence' },
  cooldown: { name: 'Cool-down', kind: 'sequence' },
};

export type Placed = { exerciseId: string; dosage: Dosage; tags?: Slot[] };

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Sections + the drills placed in each (in order) → blocks (one slot per drill) and items (every round). */
export function buildWorkout(sections: SectionShape[], placed: Record<string, Placed[]>, restBetweenRoundsSec = 90): { blocks: FrameworkBlocks; items: WorkoutItem[] } {
  const blocks: FrameworkBlock[] = [];
  const items: WorkoutItem[] = [];
  sections.forEach((sec, bi) => {
    const id = sec.id ?? `b${bi + 1}`;
    const drills = placed[id] ?? [];
    const slots: FrameworkSlot[] = drills.map((d, n) => ({ id: `d${n + 1}`, tags: d.tags ?? [], dosage: d.dosage }));
    const rounds = sec.kind === 'rounds' ? Math.max(1, sec.rounds ?? 1) : 1;
    blocks.push({ id, name: sec.name, kind: sec.kind, rounds: sec.kind === 'rounds' ? rounds : undefined, restBetweenRoundsSec: sec.kind === 'rounds' ? restBetweenRoundsSec : undefined, slots });
    for (let r = 1; r <= rounds; r++) drills.forEach((d, n) => items.push({ blockId: id, slotId: `d${n + 1}`, round: r, exerciseId: d.exerciseId, dosage: d.dosage, locked: true }));
  });
  return { blocks: { blocks }, items };
}

/** The drills of one section in play order (framework slots first, then extras), as `Placed`. */
export function placedOf(blocks: FrameworkBlocks, items: WorkoutItem[], blockId: string): Placed[] {
  const b = blocks.blocks.find((x) => x.id === blockId);
  if (!b) return [];
  const round1 = items.filter((i) => i.blockId === blockId && i.round === 1);
  const known = b.slots.map((s) => round1.find((i) => i.slotId === s.id)).filter((i): i is WorkoutItem => !!i);
  const extras = round1.filter((i) => !b.slots.some((s) => s.id === i.slotId));
  return [...known, ...extras].map((i) => ({ exerciseId: i.exerciseId, dosage: i.dosage, tags: b.slots.find((s) => s.id === i.slotId)?.tags }));
}

/**
 * Take ownership of a framework-based workout's sections: every drill becomes its own slot in play order,
 * so the result can be reordered freely. Rounds / rests of each block are kept; blockOverrides are applied.
 */
export function ownSections(blocks: FrameworkBlocks, items: WorkoutItem[], overrides?: Record<string, { skipped?: boolean; rounds?: number }>): { blocks: FrameworkBlocks; items: WorkoutItem[] } {
  const sections: SectionShape[] = [];
  const placed: Record<string, Placed[]> = {};
  for (const b of blocks.blocks) {
    const ov = overrides?.[b.id];
    if (ov?.skipped) continue;
    sections.push({ id: b.id, name: b.name, kind: b.kind, rounds: b.kind === 'rounds' ? ov?.rounds ?? b.rounds ?? 1 : undefined });
    placed[b.id] = placedOf(blocks, items, b.id);
  }
  const out = buildWorkout(sections, placed);
  // keep per-block rests / time budgets
  out.blocks.blocks = out.blocks.blocks.map((nb) => {
    const ob = blocks.blocks.find((x) => x.id === nb.id)!;
    return { ...nb, seconds: ob.seconds, restBetweenExercisesSec: ob.restBetweenExercisesSec, restBetweenRoundsSec: ob.restBetweenRoundsSec };
  });
  return out;
}

/** Move the drill at `from` to `to` within one section (indices in play order). */
export function reorderDrills(blocks: FrameworkBlocks, items: WorkoutItem[], blockId: string, from: number, to: number): { blocks: FrameworkBlocks; items: WorkoutItem[] } {
  const own = ownSections(blocks, items);
  const b = own.blocks.blocks.find((x) => x.id === blockId);
  if (!b || from === to || from < 0 || to < 0 || from >= b.slots.length || to >= b.slots.length) return own;
  const order = b.slots.map((s) => s.id);
  const [m] = order.splice(from, 1);
  order.splice(to, 0, m);
  const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
  const drills = placedOf(own.blocks, own.items, blockId);
  const byOld = new Map(b.slots.map((s, i) => [s.id, drills[i]]));
  const placed = order.map((id) => byOld.get(id)!);
  const rebuilt = buildWorkout([{ id: blockId, name: b.name, kind: b.kind, rounds }], { [blockId]: placed }, b.restBetweenRoundsSec);
  return {
    blocks: { ...own.blocks, blocks: own.blocks.blocks.map((x) => (x.id === blockId ? { ...x, slots: rebuilt.blocks.blocks[0].slots } : x)) },
    items: [...own.items.filter((i) => i.blockId !== blockId), ...rebuilt.items],
  };
}

/** Saved-section drills → Placed (tags from the exercise are added by the caller when known). */
export const fromSection = (drills: SectionDrill[]): Placed[] => drills.map((d) => ({ exerciseId: d.exerciseId, dosage: d.dosage }));

/** Seconds of work for a list of items (rough, for the wizard's live total). */
export function workTotal(items: WorkoutItem[], secondsOf: (exerciseId: string, dosage: Dosage) => number): number {
  return items.reduce((s, i) => s + secondsOf(i.exerciseId, i.dosage), 0);
}

export { uid as builderId };
