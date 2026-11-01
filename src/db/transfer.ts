/**
 * Library transfer: export the local library as one JSON file and import such a file (upsert by id).
 * Used to seed an Android device (player-first build, plan Phase 9) from the iPhone library, and as a
 * manual backup. Skeletons + metadata + source URLs only — never video (CLAUDE.md hard rule).
 */
import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { schema } from './index';
import { TRANSFER_VERSION, type LibraryTransfer } from './transferFormat';
export { parseTransfer, TRANSFER_VERSION, type LibraryTransfer } from './transferFormat';

export async function exportLibrary(db: Db): Promise<LibraryTransfer> {
  const [exercises, sources, sourceExercise, pairing, frameworks, goals] = await Promise.all([
    db.select().from(schema.exercise),
    db.select().from(schema.source),
    db.select().from(schema.sourceExercise),
    db.select().from(schema.pairing),
    db.select().from(schema.framework),
    db.select().from(schema.goal),
  ]);
  return { app: 'movelab', version: TRANSFER_VERSION, exportedAt: Date.now(), exercises, sources, sourceExercise, pairing, frameworks, goals };
}

export type ImportResult = { exercises: number; sources: number; frameworks: number; goals: number; skipped: number };

/**
 * Upsert everything by id. Existing rows are replaced only when the file's row is newer (`updatedAt` for
 * exercises; others always replace). Preset frameworks and seeded goals are left alone.
 */
export async function importLibrary(db: Db, t: LibraryTransfer): Promise<ImportResult> {
  const out: ImportResult = { exercises: 0, sources: 0, frameworks: 0, goals: 0, skipped: 0 };
  for (const e of t.exercises) {
    const cur = await db.select({ updatedAt: schema.exercise.updatedAt }).from(schema.exercise).where(eq(schema.exercise.id, e.id));
    if (cur[0] && cur[0].updatedAt >= e.updatedAt) { out.skipped++; continue; }
    await db.insert(schema.exercise).values(e).onConflictDoUpdate({ target: schema.exercise.id, set: e });
    out.exercises++;
  }
  for (const s of t.sources) {
    await db.insert(schema.source).values(s).onConflictDoUpdate({ target: schema.source.id, set: s });
    out.sources++;
  }
  for (const se of t.sourceExercise) {
    await db.insert(schema.sourceExercise).values(se).onConflictDoUpdate({ target: [schema.sourceExercise.sourceId, schema.sourceExercise.exerciseId], set: se });
  }
  for (const p of t.pairing) {
    await db.insert(schema.pairing).values(p).onConflictDoUpdate({ target: [schema.pairing.aId, schema.pairing.bId], set: p });
  }
  for (const f of t.frameworks) {
    if (f.isPreset) continue;
    await db.insert(schema.framework).values(f).onConflictDoUpdate({ target: schema.framework.id, set: f });
    out.frameworks++;
  }
  for (const g of t.goals) {
    const cur = await db.select({ id: schema.goal.id }).from(schema.goal).where(eq(schema.goal.id, g.id));
    if (cur[0]) continue; // keep local goal progress
    await db.insert(schema.goal).values(g);
    out.goals++;
  }
  return out;
}
