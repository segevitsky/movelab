/**
 * Review-screen edits on segments: merge, split, trim, delete. Pure functions over raw frame index
 * ranges; the caller re-runs `processSegment()` for the affected ranges.
 */
import { clean, toTrack } from './clean';
import { feet } from './feet';
import { features } from './features';
import { bestLoop, findPeriod } from './reps';
import { sanityCheck } from './sanity';
import type { RawFrame, Segment } from './types';
import type { ProcessedSegment } from './index';

export type Range = { start: number; end: number }; // inclusive raw-frame indices

/** Process one explicit frame range (used after an edit). */
export function processRange(frames: RawFrame[], range: Range, fps: number): ProcessedSegment {
  const seg: Segment = { start: range.start, end: range.end, t0: frames[range.start].t, t1: frames[range.end].t, cutReason: 'external' };
  const slice = frames.slice(range.start, range.end + 1);
  const { xy, conf } = toTrack(slice);
  const cl = clean(xy, conf, fps);
  const period = cl.length > fps * 2 ? findPeriod(cl, fps) : null;
  return {
    segment: seg,
    fps,
    xy: cl,
    issues: sanityCheck(cl),
    period,
    loop: period && period.periodic ? bestLoop(cl, period.lag) : null,
    toes: feet(slice, cl, fps, 'toe'),
    heels: feet(slice, cl, fps, 'heel'),
    features: features(cl, fps),
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
