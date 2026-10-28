import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { framework, goal } from './schema';
import type { FrameworkBlocks, GoalStage } from './types';
import type { Slot } from './vocab';

/** Presets from the product spec §4.4. Pure data so it is testable. */
export const PRESET_FRAMEWORKS: { id: string; name: string; blocks: FrameworkBlocks }[] = [
  {
    id: 'preset-segev-3x6',
    name: 'Segev 3×6',
    blocks: {
      blocks: [
        { id: 'warmup', name: 'Warm-up', kind: 'sequence', seconds: 360, restBetweenExercisesSec: 0,
          slots: [1, 2, 3, 4].map((i) => ({ id: `w${i}`, tags: ['warmup', 'locomotion', 'mobility'] as Slot[], dosage: { type: 'time', value: 90 } })) },
        { id: 'rounds', name: 'Rounds', kind: 'rounds', rounds: 3, restBetweenExercisesSec: 0, restBetweenRoundsSec: 120,
          slots: [
            { id: 's1', tags: ['skill', 'strength'], isSkill: true },
            { id: 's2', tags: ['pull'] },
            { id: 's3', tags: ['push'] },
            { id: 's4', tags: ['legs'] },
            { id: 's5', tags: ['core'] },
            { id: 's6', tags: ['cardio'], optional: true },
          ] },
        { id: 'cooldown', name: 'Cool-down', kind: 'sequence', seconds: 180,
          slots: [{ id: 'c1', tags: ['stretch', 'cooldown'], dosage: { type: 'time', value: 90 } }, { id: 'c2', tags: ['stretch', 'cooldown'], dosage: { type: 'time', value: 90 } }] },
      ],
    },
  },
  {
    id: 'preset-emom-20',
    name: 'EMOM 20',
    blocks: {
      blocks: [
        { id: 'warmup', name: 'Warm-up', kind: 'sequence', seconds: 240, slots: [{ id: 'w1', tags: ['warmup', 'mobility'], dosage: { type: 'time', value: 120 } }, { id: 'w2', tags: ['locomotion', 'warmup'], dosage: { type: 'time', value: 120 } }] },
        { id: 'emom', name: 'Every minute', kind: 'rounds', rounds: 5, restBetweenExercisesSec: 0, restBetweenRoundsSec: 0,
          slots: [{ id: 'e1', tags: ['pull'], dosage: { type: 'time', value: 60 } }, { id: 'e2', tags: ['push'], dosage: { type: 'time', value: 60 } }, { id: 'e3', tags: ['legs'], dosage: { type: 'time', value: 60 } }, { id: 'e4', tags: ['core'], dosage: { type: 'time', value: 60 } }] },
      ],
    },
  },
  {
    id: 'preset-tabata',
    name: 'Tabata',
    blocks: {
      blocks: [
        { id: 'warmup', name: 'Warm-up', kind: 'sequence', seconds: 180, slots: [{ id: 'w1', tags: ['warmup', 'locomotion'], dosage: { type: 'time', value: 180 } }] },
        { id: 'tabata', name: '20/10 × 8', kind: 'rounds', rounds: 8, restBetweenExercisesSec: 10, restBetweenRoundsSec: 10,
          slots: [{ id: 't1', tags: ['cardio', 'legs'], dosage: { type: 'time', value: 20 } }, { id: 't2', tags: ['core', 'push'], dosage: { type: 'time', value: 20 } }] },
        { id: 'cooldown', name: 'Cool-down', kind: 'sequence', seconds: 120, slots: [{ id: 'c1', tags: ['stretch'], dosage: { type: 'time', value: 120 } }] },
      ],
    },
  },
  {
    id: 'preset-flow',
    name: 'Flow (continuous)',
    blocks: {
      blocks: [
        { id: 'flow', name: 'Flow', kind: 'sequence', restBetweenExercisesSec: 0,
          slots: Array.from({ length: 8 }, (_, i) => ({ id: `f${i + 1}`, tags: ['mobility', 'locomotion', 'skill', 'core'] as Slot[], dosage: { type: 'time', value: 60 } })) },
      ],
    },
  },
  {
    id: 'preset-skill-only',
    name: 'Skill only',
    blocks: {
      blocks: [
        { id: 'warmup', name: 'Warm-up', kind: 'sequence', seconds: 300, slots: [{ id: 'w1', tags: ['warmup', 'mobility'], dosage: { type: 'time', value: 150 } }, { id: 'w2', tags: ['warmup', 'locomotion'], dosage: { type: 'time', value: 150 } }] },
        { id: 'skill', name: 'Skill practice', kind: 'rounds', rounds: 4, restBetweenExercisesSec: 60, restBetweenRoundsSec: 90,
          slots: [{ id: 'k1', tags: ['skill'], isSkill: true }, { id: 'k2', tags: ['skill', 'strength'] }] },
      ],
    },
  },
];

/** reference/seed-goals.md — stages store names; exerciseId is linked by the user later. */
const G = (name: string, slot: Slot, stages: [string, string][], notes?: string) => ({
  id: `goal-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  slot,
  stages: stages.map(([n, c]) => ({ name: n, exerciseId: null, criterion: c, slot }) as GoalStage),
  notes,
});

export const SEED_GOALS = [
  G('Pull-ups', 'strength', [
    ['Active hang + scapular pulls', '3 × 30 s hang, 3 × 10 scap pulls'],
    ['Negatives (5 s lowering)', '3 × 5'],
    ['Band-assisted pull-ups', '3 × 8'],
    ['Sets of 3–5 strict', '5 × 3'],
    ['Volume to 10', '3 × 10'],
    ['15–20 strict or weighted pull-ups', '15–20 clean'],
  ], 'target 15–20 clean; early in the round'),
  G('Muscle-up', 'skill', [
    ['High pull-ups (chest to bar)', '3 × 5'],
    ['Explosive pull-ups', '3 × 5'],
    ['Low-bar transition drills with feet', '3 × 5'],
    ['Band-assisted muscle-up', '3 × 3'],
    ['Strict muscle-up', '1 clean rep, then 3 × 3'],
  ], 'entry: 10 strict pull-ups + 10 straight-bar dips; first in round'),
  G('L-sit', 'skill', [
    ['Straight-arm support (shoulders depressed)', '3 × 30 s'],
    ['Seated leg lifts (hands by knees)', '3 × 10'],
    ['Tuck L-sit', '3 × 20 s'],
    ['One-leg L-sit, alternating', '3 × 10 s per leg'],
    ['Full L-sit', '3 × 10 s → build to 20 s'],
  ], 'slot: skill / core'),
  G('Front splits', 'stretch', [
    ['Low lunge hip-flexor stretch', '2 × 60 s per side'],
    ['Half splits (hamstring)', '2 × 60 s per side'],
    ['Active lifts (leg off floor in half split)', '2 × 10 per side'],
    ['Splits on blocks', '2 × 60 s per side'],
    ['Full front split', 'hold 30 s'],
  ], 'warm-up + cool-down, near daily'),
  G('Knee strength', 'legs', [
    ['Backward walking', '3 × 30 m'],
    ['Tibialis raises', '3 × 20'],
    ['Spanish squat (band)', '3 × 30 s'],
    ['Poliquin step-up', '3 × 12 per side'],
    ['Deep split squat', '3 × 8 per side'],
    ['Pistol squat', '3 × 5 per side'],
  ]),
  G('Crawls', 'warmup', [
    ['Bear crawl', '3 × 20 m'],
    ['Crab walk', '3 × 20 m'],
    ['Lizard crawl', '3 × 10 m'],
    ['Transitions between crawls', '3 × 60 s'],
    ['Continuous 60 s flow', '60 s without stopping'],
  ]),
];

/** Idempotent: inserts presets/goals that are missing; never overwrites user edits. */
export async function seedIfNeeded(db: Db) {
  const now = Date.now();
  for (const f of PRESET_FRAMEWORKS) {
    const exists = await db.select({ id: framework.id }).from(framework).where(eq(framework.id, f.id));
    if (exists.length === 0) await db.insert(framework).values({ id: f.id, name: f.name, blocks: f.blocks, isPreset: true, createdAt: now });
  }
  for (const g of SEED_GOALS) {
    const exists = await db.select({ id: goal.id }).from(goal).where(eq(goal.id, g.id));
    if (exists.length === 0) await db.insert(goal).values({ id: g.id, name: g.name, slot: g.slot, stages: g.stages, currentStage: 0, active: false, notes: g.notes ?? null });
  }
}
