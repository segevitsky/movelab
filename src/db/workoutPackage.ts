/**
 * Workout package (pure TS, unit-tested): one saved workout handed from one phone to another as a file —
 * a physical therapist sending a patient their programme, a creator sending followers a session
 * (owner, 2026-11-08). The file carries the workout's sections, drills, dosages and rests, and every
 * exercise it uses: name, tags, the stick-figure skeleton (+ 3D track), the source link. Never video, never
 * images (CLAUDE.md). The database side lives in ./workoutTransfer.ts.
 */
import type { schema } from './index';
import type { Exercise, Source, Workout } from './schema';
import type { FrameworkBlocks } from './types';

export const WORKOUT_PACKAGE_VERSION = 1;
export const WORKOUT_FILE_EXT = 'movelab';
export const WORKOUT_FILE_UTI = 'com.segev.movelab.workout';
export const WORKOUT_FILE_MIME = 'application/vnd.movelab.workout+json';

type SourceExercise = typeof schema.sourceExercise.$inferSelect;

export type WorkoutPackage = {
  app: 'movelab';
  kind: 'workout';
  version: number;
  exportedAt: number;
  /** who sent it (shown on the receiver's copy); null when the sender did not give a name */
  sender: string | null;
  /** the workout with its sections embedded (`blocks` always set, no framework needed on the receiver) */
  workout: Workout;
  exercises: Exercise[];
  sources: Source[];
  sourceExercise: SourceExercise[];
};

/** Build the package: only the exercises the workout uses, with their sources. */
export function buildWorkoutPackage(args: {
  workout: Workout; blocks: FrameworkBlocks; exercises: Exercise[]; sources: Source[]; sourceExercise: SourceExercise[];
  sender?: string | null; now?: number;
}): WorkoutPackage {
  const ids = new Set(args.workout.items.map((it) => it.exerciseId));
  const exercises = args.exercises.filter((e) => ids.has(e.id));
  const sourceExercise = args.sourceExercise.filter((se) => ids.has(se.exerciseId));
  const srcIds = new Set<string>([...exercises.map((e) => e.sourceId).filter((x): x is string => !!x), ...sourceExercise.map((se) => se.sourceId)]);
  const sources = args.sources.filter((s) => srcIds.has(s.id));
  const workout: Workout = { ...args.workout, blocks: args.blocks, frameworkId: 'built' };
  return { app: 'movelab', kind: 'workout', version: WORKOUT_PACKAGE_VERSION, exportedAt: args.now ?? Date.now(), sender: args.sender?.trim() || null, workout, exercises, sources, sourceExercise };
}

/** Light structural check before touching the database. */
export function parseWorkoutPackage(text: string): WorkoutPackage {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Not a MoveLab workout file'); }
  const d = data as Partial<WorkoutPackage>;
  if (!d || d.app !== 'movelab' || d.kind !== 'workout' || typeof d.version !== 'number') throw new Error('Not a MoveLab workout file');
  if (d.version > WORKOUT_PACKAGE_VERSION) throw new Error(`This file needs a newer MoveLab (format v${d.version}, this app reads v${WORKOUT_PACKAGE_VERSION})`);
  const w = d.workout;
  if (!w || typeof w.id !== 'string' || !Array.isArray(w.items) || !w.blocks || !Array.isArray(w.blocks.blocks)) throw new Error('The workout in this file is incomplete');
  if (!Array.isArray(d.exercises)) throw new Error('No exercises in this file');
  const have = new Set(d.exercises.map((e) => e.id));
  const missing = w.items.filter((it) => !have.has(it.exerciseId)).length;
  if (missing) throw new Error(`${missing} drill${missing === 1 ? '' : 's'} in this file ha${missing === 1 ? 's' : 've'} no exercise`);
  return { sender: null, sources: [], sourceExercise: [], ...d } as WorkoutPackage;
}

/** What the receiver sees before importing. */
export function describePackage(p: WorkoutPackage): { name: string; sections: number; drills: number; exercises: number; drillNames: string[] } {
  const byId = new Map(p.exercises.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const drillNames: string[] = [];
  for (const it of p.workout.items) { if (seen.has(it.exerciseId)) continue; seen.add(it.exerciseId); drillNames.push(byId.get(it.exerciseId)?.name ?? '?'); }
  return { name: p.workout.name?.trim() || 'Workout', sections: p.workout.blocks?.blocks.length ?? 0, drills: p.workout.items.length, exercises: p.exercises.length, drillNames };
}

/** `Knee rehab · week 1` → `Knee-rehab-week-1.movelab` (Hebrew kept, punctuation dropped). */
export function packageFileName(name: string | null | undefined, fallback = 'workout'): string {
  const safe = (name ?? '').replace(/[^\w֐-׿-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
  return `${safe}.${WORKOUT_FILE_EXT}`;
}

/** Is this URL/path a workout file we should open? */
export function isWorkoutFileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0].split('#')[0];
  return new RegExp(`\\.${WORKOUT_FILE_EXT}$`, 'i').test(decodeURIComponent(path));
}
