/**
 * Phase 13 step 1 — keep the raw pose output of every capture (numbers only, never video) so a bad reel can be
 * replayed on the Mac as a pipeline fixture. Documents/captures/<time>.json, last KEEP kept.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { PoseResult } from '../../modules/pose';
import type { NormRect } from '../../modules/pose';
import type { Scene } from '../db/types';

export const KEEP = 30;

export type RawCapture = {
  version: 1;
  savedAt: number;
  title?: string | null;
  url?: string | null;
  username?: string | null;
  caption?: string | null;
  crop?: NormRect | null;
  scene?: Scene | null;
  /** player events while recording: event, video time, video duration, seconds recorded */
  timeline?: { e: string; t: number; d: number; rec: number }[];
  recordingSeconds?: number;
  /** Phase 13 step 2: per-sample picture change (t, hist 0..1, pix 0..255) and the cut times derived from it */
  sceneDiff?: { t: number; hist: number; pix: number }[];
  cutTimes?: number[];
  /** what the pipeline made of it, for a quick look without replaying */
  segments?: { start: number; end: number; name: string; frames: number; detectedPct: number }[];
  /** the MediaPipe output: frames with xy / z / v / w per landmark */
  result: PoseResult;
};

const dir = () => new Directory(Paths.document, 'captures');

export function saveRawCapture(c: Omit<RawCapture, 'version' | 'savedAt'>): string {
  const d = dir();
  if (!d.exists) d.create();
  const name = `capture-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const f = new File(d, name);
  if (f.exists) f.delete();
  f.write(JSON.stringify({ version: 1, savedAt: Date.now(), ...c } satisfies RawCapture));
  prune();
  return f.uri;
}

export function listRawCaptures(): File[] {
  const d = dir();
  if (!d.exists) return [];
  return (d.list().filter((x) => x instanceof File) as File[]).sort((a, b) => (a.name < b.name ? 1 : -1));
}

export function deleteRawCapture(f: File) {
  if (f.exists) f.delete();
}

function prune() {
  const files = listRawCaptures();
  for (const f of files.slice(KEEP)) { try { f.delete(); } catch {} }
}
