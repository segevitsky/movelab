/** Pure: a saved workout + its framework → timed steps for the player. */
import type { FrameworkBlocks } from '../db/types';
import type { Dosage } from '../db/vocab';

export type TimelineItem = { blockId: string; slotId: string; round: number; exerciseId: string; dosage: Dosage };

export type Step =
  | { kind: 'ready'; seconds: number; blockId: string; round: number; nextExerciseId: string; label: string }
  | { kind: 'work'; seconds: number; blockId: string; slotId: string; round: number; exerciseId: string; dosage: Dosage; label: string; nextExerciseId: string | null }
  | { kind: 'rest'; seconds: number; blockId: string; round: number; label: string; nextExerciseId: string | null }
  | { kind: 'done'; seconds: 0; label: string };

export type TimelineOptions = {
  readySeconds?: number; // before the first exercise of a block (default 10) and between exercises when no rest (default 5)
  repSecondsOf?: (exerciseId: string) => number | null;
};

export function workSeconds(dosage: Dosage, repSeconds: number | null | undefined) {
  if (dosage.type === 'time') return dosage.value * (dosage.perSide ? 2 : 1);
  const per = repSeconds && repSeconds > 0.8 ? repSeconds : 3;
  return Math.round(dosage.value * per * (dosage.perSide ? 2 : 1));
}

export function buildTimeline(items: TimelineItem[], blocks: FrameworkBlocks, opts: TimelineOptions = {}): Step[] {
  const ready0 = opts.readySeconds ?? 10;
  const steps: Step[] = [];
  // order: blocks in framework order; within a rounds block: round 1 all slots, round 2 …
  const ordered: TimelineItem[] = [];
  for (const b of blocks.blocks) {
    const rounds = b.kind === 'rounds' ? Math.max(1, b.rounds ?? 1) : 1;
    for (let r = 1; r <= rounds; r++) for (const s of b.slots) { const it = items.find((i) => i.blockId === b.id && i.slotId === s.id && i.round === r); if (it) ordered.push(it); }
  }
  for (let k = 0; k < ordered.length; k++) {
    const it = ordered[k];
    const b = blocks.blocks.find((x) => x.id === it.blockId)!;
    const prev = ordered[k - 1];
    const next = ordered[k + 1] ?? null;
    const firstOfBlock = !prev || prev.blockId !== it.blockId;
    const newRound = !!prev && prev.blockId === it.blockId && prev.round !== it.round;
    if (firstOfBlock) steps.push({ kind: 'ready', seconds: ready0, blockId: b.id, round: it.round, nextExerciseId: it.exerciseId, label: `${b.name} — get ready` });
    else if (newRound) {
      const rest = b.restBetweenRoundsSec ?? 0;
      if (rest > 0) steps.push({ kind: 'rest', seconds: rest, blockId: b.id, round: it.round, label: `Rest — round ${it.round} next`, nextExerciseId: it.exerciseId });
      else steps.push({ kind: 'ready', seconds: 5, blockId: b.id, round: it.round, nextExerciseId: it.exerciseId, label: `Round ${it.round}` });
    } else {
      const rest = b.restBetweenExercisesSec ?? 0;
      if (rest > 0) steps.push({ kind: 'rest', seconds: rest, blockId: b.id, round: it.round, label: 'Rest', nextExerciseId: it.exerciseId });
      else steps.push({ kind: 'ready', seconds: 5, blockId: b.id, round: it.round, nextExerciseId: it.exerciseId, label: 'Next' });
    }
    steps.push({ kind: 'work', seconds: workSeconds(it.dosage, opts.repSecondsOf?.(it.exerciseId)), blockId: b.id, slotId: it.slotId, round: it.round, exerciseId: it.exerciseId, dosage: it.dosage, label: it.dosage.type === 'reps' ? `${it.dosage.value} reps${it.dosage.perSide ? ' per side' : ''}` : `${it.dosage.value} s${it.dosage.perSide ? ' per side' : ''}`, nextExerciseId: next?.exerciseId ?? null });
  }
  steps.push({ kind: 'done', seconds: 0, label: 'Done' });
  return steps;
}

export const totalTimelineSeconds = (steps: Step[]) => steps.reduce((s, st) => s + st.seconds, 0);
