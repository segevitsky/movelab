/** Phase 12 — motion similarity + guidance. Pure modules plus a small fingerprint cache for the app. */
import type { Exercise } from '../db/schema';
import { clipFromExercise } from '../db/repo';
import { fingerprint, type Fingerprint } from './fingerprint';

export { fingerprint, similarity, components, alikePairs, ALIKE_THRESHOLD, WEIGHTS, SCALE, type Fingerprint, type Pair, type Components } from './fingerprint';
export { workoutReport, reportSummary, RULES, type Finding, type ReportDrill, type Rules } from './report';

const cache = new Map<string, { key: string; fp: Fingerprint | null }>();

/** Fingerprint of an exercise, computed once per (id, updatedAt). Null for manual exercises without a figure. */
export function fingerprintOf(e: Pick<Exercise, 'id' | 'figure' | 'scene' | 'updatedAt'>): Fingerprint | null {
  const key = `${e.figure?.length ?? 0}:${e.updatedAt}`;
  const hit = cache.get(e.id);
  if (hit && hit.key === key) return hit.fp;
  const clip = clipFromExercise(e);
  const fp = clip ? fingerprint(clip) : null;
  cache.set(e.id, { key, fp });
  return fp;
}
