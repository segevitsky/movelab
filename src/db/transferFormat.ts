/**
 * Library transfer file format (pure TS, unit-tested): what an export contains and how a file is checked
 * before import. The database side lives in ./transfer.ts.
 */
import type { schema } from './index';
import type { Exercise, Source } from './schema';

export const TRANSFER_VERSION = 1;

export type LibraryTransfer = {
  app: 'movelab';
  version: number;
  exportedAt: number;
  exercises: Exercise[];
  sources: Source[];
  sourceExercise: (typeof schema.sourceExercise.$inferSelect)[];
  pairing: (typeof schema.pairing.$inferSelect)[];
  frameworks: (typeof schema.framework.$inferSelect)[];
  goals: (typeof schema.goal.$inferSelect)[];
};

/** Light structural check before touching the database. */
export function parseTransfer(text: string): LibraryTransfer {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Not a JSON file'); }
  const d = data as Partial<LibraryTransfer>;
  if (!d || d.app !== 'movelab' || typeof d.version !== 'number') throw new Error('Not a MoveLab library file');
  if (d.version > TRANSFER_VERSION) throw new Error(`This file needs a newer MoveLab (format v${d.version}, this app reads v${TRANSFER_VERSION})`);
  if (!Array.isArray(d.exercises)) throw new Error('No exercises in this file');
  return { sources: [], sourceExercise: [], pairing: [], frameworks: [], goals: [], ...d } as LibraryTransfer;
}

