import { and, desc, eq } from 'drizzle-orm';
import { decodeClip, downsampleClip, encodeClip, fromBase64, toBase64 } from '../figure/codec';
import { clipFromProcessed } from '../figure/fromPipeline';
import type { FigureClip } from '../figure/prepare';
import type { ProcessedSegment } from '../pipeline';
import type { Db } from './index';
import { exercise, source, sourceExercise, type Exercise, type NewExercise } from './schema';
import type { Equipment, Pattern, Slot } from './vocab';

export const newId = (prefix = 'ex') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export type ExerciseFilter = { pattern?: Pattern | null; slot?: Slot | null; equipment?: Equipment | null; text?: string; includeArchived?: boolean };

/** Pure filter so the UI logic is unit-testable (SQLite JSON columns are filtered in JS; the library is small). */
export function filterExercises(rows: Exercise[], f: ExerciseFilter): Exercise[] {
  const q = f.text?.trim().toLowerCase();
  return rows.filter((e) => {
    if (!f.includeArchived && e.archived) return false;
    if (f.pattern && e.pattern !== f.pattern) return false;
    if (f.slot && !e.slots.includes(f.slot)) return false;
    if (f.equipment && !(e.equipment.includes(f.equipment) || (f.equipment === 'none' && e.equipment.length === 0))) return false;
    if (q && !(e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))) return false;
    return true;
  });
}

export function clipFromExercise(e: Pick<Exercise, 'figure'>): FigureClip | null {
  if (!e.figure) return null;
  try {
    return decodeClip(fromBase64(e.figure));
  } catch {
    return null;
  }
}

/** Store a processed pipeline segment as a new exercise (15 fps figure, loop, poses). */
export function exerciseFromProcessed(seg: ProcessedSegment, fields: Partial<NewExercise> & { name: string }): NewExercise {
  const clip = downsampleClip(clipFromProcessed(seg), 15);
  const now = Date.now();
  return {
    id: newId(),
    aliases: [],
    slots: [],
    equipment: [],
    props: [],
    primaryMuscles: [],
    ...fields,
    figure: toBase64(encodeClip(clip)),
    figureFps: clip.fps,
    figureFrames: clip.xy.length,
    loopStart: clip.loop?.i0 ?? null,
    loopEnd: clip.loop?.i1 ?? null,
    repSeconds: seg.period?.periodic ? seg.period.period : null,
    startPose: seg.features.startPose,
    endPose: seg.features.endPose,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

export async function listExercises(db: Db): Promise<Exercise[]> {
  return db.select().from(exercise).orderBy(desc(exercise.createdAt));
}

export async function getExercise(db: Db, id: string): Promise<Exercise | undefined> {
  const rows = await db.select().from(exercise).where(eq(exercise.id, id));
  return rows[0];
}

export async function insertExercise(db: Db, e: NewExercise) {
  await db.insert(exercise).values(e);
  return e.id;
}

export async function updateExercise(db: Db, id: string, patch: Partial<NewExercise>) {
  await db.update(exercise).set({ ...patch, updatedAt: Date.now() }).where(eq(exercise.id, id));
}

export async function deleteExercise(db: Db, id: string) {
  await db.delete(sourceExercise).where(eq(sourceExercise.exerciseId, id));
  await db.delete(exercise).where(eq(exercise.id, id));
}

/** Record where an exercise came from (keeps the reel → exercises relation for the pairing graph). */
export async function linkSource(db: Db, args: { url: string; coach?: string | null; caption?: string | null; exerciseIds: string[]; ranges?: { startSec: number; endSec: number }[] }) {
  const existing = await db.select().from(source).where(eq(source.url, args.url));
  const srcId = existing[0]?.id ?? newId('src');
  if (!existing[0]) await db.insert(source).values({ id: srcId, platform: 'instagram', url: args.url, coach: args.coach ?? null, caption: args.caption ?? null, capturedAt: Date.now() });
  for (let i = 0; i < args.exerciseIds.length; i++) {
    const exId = args.exerciseIds[i];
    const dup = await db.select().from(sourceExercise).where(and(eq(sourceExercise.sourceId, srcId), eq(sourceExercise.exerciseId, exId)));
    if (dup.length === 0) await db.insert(sourceExercise).values({ sourceId: srcId, exerciseId: exId, order: i, startSec: args.ranges?.[i]?.startSec ?? null, endSec: args.ranges?.[i]?.endSec ?? null });
    await db.update(exercise).set({ sourceId: srcId }).where(eq(exercise.id, exId));
  }
  return srcId;
}
