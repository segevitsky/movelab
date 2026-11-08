/**
 * Workout package ↔ database: export one saved workout with the exercises it uses; import such a package
 * into this phone's library and Recent. Format and checks live in ./workoutPackage.ts (pure).
 */
import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { schema } from './index';
import { buildWorkoutPackage, type WorkoutPackage } from './workoutPackage';
import { workoutBlocks } from './workoutRepo';

export async function exportWorkoutPackage(db: Db, workoutId: string, sender: string | null): Promise<WorkoutPackage> {
  const [w] = await db.select().from(schema.workout).where(eq(schema.workout.id, workoutId));
  if (!w) throw new Error('Workout not found');
  const blocks = await workoutBlocks(db, w);
  if (!blocks) throw new Error('This workout has no sections to share');
  const [exercises, sources, sourceExercise] = await Promise.all([
    db.select().from(schema.exercise),
    db.select().from(schema.source),
    db.select().from(schema.sourceExercise),
  ]);
  return buildWorkoutPackage({ workout: w, blocks, exercises, sources, sourceExercise, sender });
}

export type WorkoutImportResult = { workoutId: string; exercisesAdded: number; exercisesUpdated: number; exercisesKept: number; replacedWorkout: boolean };

/**
 * Exercises are upserted by id (a newer `updatedAt` wins; the receiver's own edits are kept otherwise).
 * The workout keeps the sender's id, so sending the same programme again replaces the earlier copy; it lands
 * at the top of Recent with "from <sender>" in its description.
 */
export async function importWorkoutPackage(db: Db, p: WorkoutPackage): Promise<WorkoutImportResult> {
  const out: WorkoutImportResult = { workoutId: p.workout.id, exercisesAdded: 0, exercisesUpdated: 0, exercisesKept: 0, replacedWorkout: false };
  for (const e of p.exercises) {
    const cur = await db.select({ updatedAt: schema.exercise.updatedAt }).from(schema.exercise).where(eq(schema.exercise.id, e.id));
    if (cur[0]) {
      if (cur[0].updatedAt >= e.updatedAt) { out.exercisesKept++; continue; }
      await db.update(schema.exercise).set({ ...e, archived: false }).where(eq(schema.exercise.id, e.id));
      out.exercisesUpdated++;
    } else {
      await db.insert(schema.exercise).values(e);
      out.exercisesAdded++;
    }
  }
  for (const s of p.sources) await db.insert(schema.source).values(s).onConflictDoUpdate({ target: schema.source.id, set: s });
  for (const se of p.sourceExercise) await db.insert(schema.sourceExercise).values(se).onConflictDoUpdate({ target: [schema.sourceExercise.sourceId, schema.sourceExercise.exerciseId], set: se });
  const from = p.sender ? `from ${p.sender}` : 'shared with you';
  const desc = p.workout.description?.trim() ? `${p.workout.description.trim()} · ${from}` : from;
  const row = { ...p.workout, frameworkId: 'built', blocks: p.workout.blocks, description: desc, favourite: false, createdAt: Date.now() };
  const existing = await db.select({ id: schema.workout.id }).from(schema.workout).where(eq(schema.workout.id, row.id));
  out.replacedWorkout = existing.length > 0;
  await db.insert(schema.workout).values(row).onConflictDoUpdate({ target: schema.workout.id, set: row });
  return out;
}
