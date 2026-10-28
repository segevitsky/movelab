import { desc, eq, gt } from 'drizzle-orm';
import { buildPairings } from '../generator/pairing';
import { dosageFactors } from '../generator/feedback';
import type { GenContext, GenExercise, GenGoal, GenWorkout, HistoryEntry, PairingEdge } from '../generator/types';
import type { Db } from './index';
import { exercise, framework, goal, pairing, session, sourceExercise, workout, type Exercise, type Framework } from './schema';
import type { FrameworkBlocks, SessionFeedback, WorkoutInputs } from './types';
import { newId } from './repo';

export function toGenExercise(e: Exercise): GenExercise {
  return { id: e.id, name: e.name, pattern: e.pattern, slots: e.slots, equipment: e.equipment, primaryMuscles: e.primaryMuscles, dosageDefault: e.dosageDefault, repSeconds: e.repSeconds, startPose: e.startPose, endPose: e.endPose, archived: e.archived };
}

export async function listFrameworks(db: Db): Promise<Framework[]> {
  return db.select().from(framework).orderBy(desc(framework.isPreset), framework.name);
}

export async function getFramework(db: Db, id: string) {
  return (await db.select().from(framework).where(eq(framework.id, id)))[0];
}

export async function saveFramework(db: Db, f: { id?: string; name: string; blocks: FrameworkBlocks; isPreset?: boolean }) {
  const id = f.id ?? newId('fw');
  const exists = f.id ? await getFramework(db, f.id) : undefined;
  if (exists) await db.update(framework).set({ name: f.name, blocks: f.blocks }).where(eq(framework.id, id));
  else await db.insert(framework).values({ id, name: f.name, blocks: f.blocks, isPreset: f.isPreset ?? false, createdAt: Date.now() });
  return id;
}

export async function deleteFramework(db: Db, id: string) {
  await db.delete(framework).where(eq(framework.id, id));
}

/** Rebuild the pairing graph from source_exercise rows and persist it (derived data, cheap to redo). */
export async function rebuildPairings(db: Db): Promise<PairingEdge[]> {
  const rows = await db.select().from(sourceExercise);
  const edges = buildPairings(rows.map((r) => ({ sourceId: r.sourceId, exerciseId: r.exerciseId, order: r.order })));
  await db.delete(pairing);
  for (let i = 0; i < edges.length; i += 100) {
    await db.insert(pairing).values(edges.slice(i, i + 100).map((e) => ({ aId: e.aId, bId: e.bId, weight: e.weight, directedWeight: e.directedWeight })));
  }
  return edges;
}

/** Everything the generator needs, read from the DB (history = last 14 days). */
export async function loadGenContext(db: Db, frameworkId: string, inputs: WorkoutInputs, seed: number): Promise<GenContext> {
  const fw = await getFramework(db, frameworkId);
  if (!fw) throw new Error('framework not found');
  const lib = (await db.select().from(exercise)).map(toGenExercise);
  const edges = await rebuildPairings(db);
  const goals: GenGoal[] = (await db.select().from(goal)).map((g) => ({ id: g.id, name: g.name, active: g.active, exerciseId: g.stages[g.currentStage]?.exerciseId ?? null }));
  const since = Date.now() - 14 * 86400000;
  const recentW = await db.select().from(workout).where(gt(workout.createdAt, since)).orderBy(desc(workout.createdAt));
  const history: HistoryEntry[] = recentW.map((w) => ({ createdAt: w.createdAt, exerciseIds: [...new Set(w.items.map((i) => i.exerciseId))] }));
  const sessions = await db.select().from(session);
  const wById = new Map((await db.select().from(workout)).map((w) => [w.id, w]));
  const factor = dosageFactors(sessions.map((s) => ({ feedback: s.feedback, endedAt: s.endedAt, exerciseIds: wById.get(s.workoutId)?.items.map((i) => i.exerciseId) ?? [] })));
  return { frameworkId, blocks: fw.blocks, library: lib, pairings: edges, goals, history, inputs, seed, dosageFactor: factor };
}

export async function saveWorkout(db: Db, w: GenWorkout) {
  const id = newId('wo');
  await db.insert(workout).values({ id, frameworkId: w.frameworkId, seed: w.seed, inputs: w.inputs, items: w.items.map(({ blockId, slotId, round, exerciseId, dosage, locked }) => ({ blockId, slotId, round, exerciseId, dosage, locked })), why: w.why, favourite: false, createdAt: Date.now() });
  return id;
}

export async function recentWorkouts(db: Db, n = 10) {
  return db.select().from(workout).orderBy(desc(workout.createdAt)).limit(n);
}

export async function getWorkout(db: Db, id: string) {
  return (await db.select().from(workout).where(eq(workout.id, id)))[0];
}

export async function startSession(db: Db, workoutId: string) {
  const id = newId('se');
  await db.insert(session).values({ id, workoutId, startedAt: Date.now(), endedAt: null, feedback: null, perExercise: null });
  return id;
}

export async function endSession(db: Db, id: string, feedback: SessionFeedback, perExercise?: Record<string, { feedback?: SessionFeedback; note?: string }>) {
  await db.update(session).set({ endedAt: Date.now(), feedback, perExercise: perExercise ?? null }).where(eq(session.id, id));
}

export async function toggleFavourite(db: Db, id: string, value: boolean) {
  await db.update(workout).set({ favourite: value }).where(eq(workout.id, id));
}
