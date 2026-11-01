import { desc, eq, gt } from 'drizzle-orm';
import { buildPairings } from '../generator/pairing';
import { dosageFactors } from '../generator/feedback';
import type { GenContext, GenExercise, GenGoal, GenWorkout, HistoryEntry, PairingEdge } from '../generator/types';
import type { Db } from './index';
import { exercise, framework, goal, pairing, session, sourceExercise, workout, type Exercise, type Framework } from './schema';
import type { FrameworkBlocks, SessionFeedback, WorkoutInputs, WorkoutItem } from './types';
import type { WorkoutTag } from './vocab';
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

/** Phase 10: a workout built by hand owns its sections (blocks on the row); frameworkId is the 'built' marker. */
export async function saveBuiltWorkout(db: Db, w: { name: string | null; description?: string | null; tags?: WorkoutTag[] | null; blocks: FrameworkBlocks; items: WorkoutItem[]; inputs?: WorkoutInputs; why?: string | null }) {
  const id = newId('wo');
  await db.insert(workout).values({ id, frameworkId: 'built', seed: 0, inputs: w.inputs ?? {}, items: w.items, blocks: w.blocks, why: w.why ?? null, favourite: false, name: w.name, description: w.description ?? null, tags: w.tags ?? null, createdAt: Date.now() });
  return id;
}

/** Replace a workout's sections + items (reordering by hand takes ownership of the sections). */
export async function updateWorkoutBlocks(db: Db, id: string, blocks: FrameworkBlocks, items: WorkoutItem[], inputs?: WorkoutInputs) {
  await db.update(workout).set({ blocks, items, ...(inputs ? { inputs } : {}) }).where(eq(workout.id, id));
}

/** The sections a workout plays: its own, else its framework's. */
export async function workoutBlocks(db: Db, w: { frameworkId: string; blocks?: FrameworkBlocks | null }): Promise<FrameworkBlocks | undefined> {
  if (w.blocks) return w.blocks;
  return (await getFramework(db, w.frameworkId))?.blocks;
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

/** Delete a workout and its sessions (history for the generator shrinks accordingly). */
export async function deleteWorkout(db: Db, id: string) {
  await db.delete(session).where(eq(session.workoutId, id));
  await db.delete(workout).where(eq(workout.id, id));
}

/** Name / description / tags of a saved workout. */
export async function updateWorkoutMeta(db: Db, id: string, meta: { name?: string | null; description?: string | null; tags?: WorkoutTag[] | null }) {
  await db.update(workout).set(meta).where(eq(workout.id, id));
}

/** Suggest workout tags from what the drills are tagged with (most frequent slots first, warm-up/cool-down ignored). */
export function suggestWorkoutTags(items: WorkoutItem[], byId: Map<string, Pick<Exercise, 'slots'>>, max = 3): WorkoutTag[] {
  const count = new Map<WorkoutTag, number>();
  for (const it of items) {
    if (it.round !== 1) continue;
    for (const s of byId.get(it.exerciseId)?.slots ?? []) {
      const t = (s === 'legs' || s === 'push' || s === 'pull' || s === 'core' || s === 'cardio' || s === 'mobility' || s === 'skill' || s === 'strength') ? (s as WorkoutTag) : null;
      if (t) count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (sorted.includes('push') && sorted.includes('pull')) sorted.splice(Math.min(sorted.indexOf('push'), sorted.indexOf('pull')), 0, 'upper'); // push + pull → an upper-body day
  return sorted.slice(0, max);
}

/** Replace the items of a saved workout (edits from the workout screen / the player's swap). */
export async function updateWorkoutItems(db: Db, id: string, items: WorkoutItem[], inputs?: WorkoutInputs) {
  await db.update(workout).set({ items, ...(inputs ? { inputs } : {}) }).where(eq(workout.id, id));
}
