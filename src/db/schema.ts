import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { FrameworkBlocks, GoalStage, Scene, SessionFeedback, WorkoutInputs, WorkoutItem } from './types';
import type { Dosage, Equipment, Intensity, Muscle, Pattern, Slot } from './vocab';

/** Architecture §7. JSON columns are typed via `$type`; the figure is a binary blob (see src/figure/codec). */

export const exercise = sqliteTable(
  'exercise',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
    pattern: text('pattern').$type<Pattern>(),
    slots: text('slots', { mode: 'json' }).$type<Slot[]>().notNull().default([]),
    equipment: text('equipment', { mode: 'json' }).$type<Equipment[]>().notNull().default([]),
    props: text('props', { mode: 'json' }).$type<string[]>().notNull().default([]),
    intensity: text('intensity').$type<Intensity>(),
    primaryMuscles: text('primary_muscles', { mode: 'json' }).$type<Muscle[]>().notNull().default([]),
    dosageDefault: text('dosage_default', { mode: 'json' }).$type<Dosage>(),
    repSeconds: real('rep_seconds'),
    notes: text('notes'),
    /** normalised pose vectors (34 numbers) for flow chaining */
    startPose: text('start_pose', { mode: 'json' }).$type<number[]>(),
    endPose: text('end_pose', { mode: 'json' }).$type<number[]>(),
    /** encoded FigureClip (src/figure/codec), 15 fps int16; null for manual exercises without video */
    figure: text('figure'),
    figureFps: real('figure_fps'),
    figureFrames: integer('figure_frames'),
    loopStart: integer('loop_start'),
    loopEnd: integer('loop_end'),
    figure3d: text('figure_3d'),
    /** Architecture §5a: mat quad + crop rect + camera flag; null = generic floor */
    scene: text('scene', { mode: 'json' }).$type<Scene>(),
    sourceId: text('source_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('exercise_pattern_idx').on(t.pattern), index('exercise_archived_idx').on(t.archived)],
);

export const source = sqliteTable('source', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull().default('instagram'),
  url: text('url').notNull(),
  coach: text('coach'),
  caption: text('caption'),
  ocrText: text('ocr_text'),
  transcript: text('transcript'),
  capturedAt: integer('captured_at').notNull(),
});

export const sourceExercise = sqliteTable(
  'source_exercise',
  {
    sourceId: text('source_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    order: integer('order').notNull(),
    startSec: real('start_sec'),
    endSec: real('end_sec'),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.exerciseId] })],
);

export const pairing = sqliteTable(
  'pairing',
  {
    aId: text('a_id').notNull(),
    bId: text('b_id').notNull(),
    weight: real('weight').notNull().default(0),
    directedWeight: real('directed_weight').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.aId, t.bId] })],
);

export const framework = sqliteTable('framework', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  blocks: text('blocks', { mode: 'json' }).$type<FrameworkBlocks>().notNull(),
  isPreset: integer('is_preset', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const goal = sqliteTable('goal', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slot: text('slot').$type<Slot>(),
  stages: text('stages', { mode: 'json' }).$type<GoalStage[]>().notNull(),
  currentStage: integer('current_stage').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
});

export const workout = sqliteTable('workout', {
  id: text('id').primaryKey(),
  frameworkId: text('framework_id').notNull(),
  seed: integer('seed').notNull(),
  inputs: text('inputs', { mode: 'json' }).$type<WorkoutInputs>().notNull(),
  items: text('items', { mode: 'json' }).$type<WorkoutItem[]>().notNull(),
  why: text('why'),
  favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  feedback: text('feedback').$type<SessionFeedback>(),
  perExercise: text('per_exercise', { mode: 'json' }).$type<Record<string, { feedback?: SessionFeedback; note?: string }>>(),
});

export type Exercise = typeof exercise.$inferSelect;
export type NewExercise = typeof exercise.$inferInsert;
export type Source = typeof source.$inferSelect;
export type Framework = typeof framework.$inferSelect;
export type Goal = typeof goal.$inferSelect;
export type Workout = typeof workout.$inferSelect;
export type Session = typeof session.$inferSelect;
