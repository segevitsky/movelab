import { and, desc, eq } from 'drizzle-orm';
import { decodeClip, downsampleClip, encodeClip, fromBase64, toBase64 } from '../figure/codec';
import { decodeWorld } from '../figure/codec3d';
import { clipFromView3d } from '../figure/view3d';
import type { World } from '../pipeline/floor';
import { clipFromProcessed } from '../figure/fromPipeline';
import type { FigureClip } from '../figure/prepare';
import type { ProcessedSegment } from '../pipeline';
import type { Db } from './index';
import { exercise, source, sourceExercise, type Exercise, type NewExercise } from './schema';
import type { Equipment, Pattern, Slot } from './vocab';

import { newId } from './exerciseRow';
export { newId, exerciseFromProcessed } from './exerciseRow';

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

/** The stored 3D track (Phase 14), frame-aligned with the figure; null when the card has none. */
export function worldFromExercise(e: Pick<Exercise, 'figure3d'>): World | null {
  if (!e.figure3d) return null;
  try { return decodeWorld(fromBase64(e.figure3d)).world; } catch { return null; }
}

/** The figure seen from a rotated camera (three-quarter by default); null without a 3D track. */
export function clipFromExercise3d(e: Pick<Exercise, 'figure' | 'figure3d' | 'scene'>, yawDeg = 35): FigureClip | null {
  const clip = clipFromExercise(e);
  const world = worldFromExercise(e);
  if (!clip || !world) return null;
  return clipFromView3d(clip, world, { yawDeg });
}

/** Should this card default to the 3D view? Frontal reels (facing ≳ 0.8) with a stored 3D track. */
export function prefers3d(e: Pick<Exercise, 'figure3d' | 'scene'>): boolean {
  return !!e.figure3d && (e.scene?.facing ?? 0) >= 0.8;
}

export type FigureView = 'flat' | '3d';

/**
 * The view this card is shown in: flat (as filmed) unless the owner picked the 3/4 view on the card; never 3D
 * without a 3D track. Owner, 2026-11-04: "lets not make it the default … until we figure things out" — the
 * frontal-reel automatic choice (prefers3d) is only a hint on the card now.
 */
export function viewOf(e: Pick<Exercise, 'figure3d' | 'scene'>): FigureView {
  if (!e.figure3d) return 'flat';
  return e.scene?.view ?? 'flat';
}

/** The clip every screen draws: the flat (as filmed) figure or the three-quarter 3D view, per viewOf. */
export function clipForExercise(e: Pick<Exercise, 'figure' | 'figure3d' | 'scene'>): FigureClip | null {
  if (viewOf(e) === '3d') { const c = clipFromExercise3d(e); if (c) return c; }
  return clipFromExercise(e);
}

export function clipFromExercise(e: Pick<Exercise, 'figure' | 'scene'>): FigureClip | null {
  if (!e.figure) return null;
  try {
    const clip = decodeClip(fromBase64(e.figure));
    if (e.scene?.matQuad || e.scene?.floor) clip.scene = { matQuad: e.scene.matQuad?.map((p) => [p[0], p[1]] as [number, number]), floor: e.scene.floor };
    return clip;
  } catch {
    return null;
  }
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
