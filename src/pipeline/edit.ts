/**
 * Review-screen edits on segments: merge, split, trim, delete. Pure functions over raw frame index
 * ranges; the caller re-runs `processSegment()` for the affected ranges.
 */
import { clean, toTrack } from './clean';
import { feet } from './feet';
import { features } from './features';
import { bestLoop, findPeriod } from './reps';
import { hideImplausibleLimbs, sanityCheck } from './sanity';
import { contacts as detectContacts } from './contacts';
import { fitFloor, pinToFloor, type World } from './floor';
import { median } from './math';
import { torsoLengths } from './clean';
import type { RawFrame, Segment } from './types';
import type { ProcessedSegment } from './index';

export type Range = { start: number; end: number }; // inclusive raw-frame indices

/** Process one explicit frame range (used after an edit). */
export function processRange(frames: RawFrame[], range: Range, fps: number, opts: { matQuad?: [number, number][] } = {}): ProcessedSegment {
  const seg: Segment = { start: range.start, end: range.end, t0: frames[range.start].t, t1: frames[range.end].t, cutReason: 'external' };
  const slice = frames.slice(range.start, range.end + 1);
  const { xy, conf } = toTrack(slice);
  const full = clean(xy, conf, fps);
  const issues = sanityCheck(full);
  const cl = hideImplausibleLimbs(clean(xy, conf, fps, { maxGapSeconds: 1.0 }), issues, fps);
  const period = full.length > fps * 2 ? findPeriod(full, fps) : null;
  const world: World = slice.map((f) => (f.w && f.w.length === 33 ? f.w : undefined));
  const torso = median(torsoLengths(full));
  const contacts = detectContacts(full, fps, torso);
  const floor = fitFloor(full, contacts, { world, matQuad: opts.matQuad });
  const pinned = pinToFloor(full, contacts, floor, fps, { torso, world });
  const clPinned = cl.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + pinned.offset[i]] as [number, number]))));
  return {
    segment: seg,
    fps,
    xy: clPinned,
    xyFull: pinned.xy,
    contacts,
    floor,
    pinOffset: pinned.offset,
    issues,
    period,
    loop: period && period.periodic ? bestLoop(full, period.lag) : null,
    toes: feet(slice, clPinned, fps, 'toe'),
    heels: feet(slice, clPinned, fps, 'heel'),
    features: features(full, fps),
  };
}

export function mergeRanges(a: Range, b: Range): Range {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/** Split at a raw-frame index (goes to the second half). Returns null if either side would be < minFrames. */
export function splitRange(r: Range, at: number, minFrames = 15): [Range, Range] | null {
  if (at - r.start < minFrames || r.end - at + 1 < minFrames) return null;
  return [{ start: r.start, end: at - 1 }, { start: at, end: r.end }];
}

export function trimRange(r: Range, start: number, end: number, minFrames = 15): Range | null {
  const s = Math.max(r.start, Math.min(start, end));
  const e = Math.min(r.end, Math.max(start, end));
  if (e - s + 1 < minFrames) return null;
  return { start: s, end: e };
}

/** Raw-frame index nearest to a time. */
export function frameAt(frames: RawFrame[], t: number, within: Range): number {
  let best = within.start;
  let bd = Infinity;
  for (let i = within.start; i <= within.end; i++) {
    const d = Math.abs(frames[i].t - t);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
