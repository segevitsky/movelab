/**
 * Review-screen edits on segments: merge, split, trim, delete. Pure functions over raw frame index
 * ranges; the caller re-runs `processSegment()` for the affected ranges.
 */
import { clean, toTrack } from './clean';
import { feet } from './feet';
import { hands } from './hands';
import { features } from './features';
import { bestLoop, findPeriod } from './reps';
import { hideImplausibleLimbs, sanityCheck } from './sanity';
import { holdLimbs } from './hold';
import { contacts as detectContacts } from './contacts';
import { fitFloor, pinToFloor, type World } from './floor';
import { cleanWorld, LIMB_DISTAL_JOINTS } from './bones3d';
import { depthOrder } from './depth';
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
  // Phase 2.5 step 4: 3D bone-length check first — flagged limb-frames become unknown in 2D too (→ gap fill)
  // Phase 17 hybrid rules, same as processCapture: MediaPipe's 3D flags never veto the whole-body model's 2D
  // points, and the limb "collapse" rule (a MediaPipe failure mode) is off (Review runs this path — 57 % on
  // the phone vs ≥ 90 % in the main pipeline until both paths matched, 2026-11-10)
  const hybrid = slice.some((f) => !!f.wb);
  const rawWorld: World = slice.map((f) => (f.w && f.w.length === 33 ? f.w : undefined));
  const w3 = cleanWorld(rawWorld, fps);
  if (!hybrid) for (const is of w3.issues) for (const limb of is.limbs) for (const j of LIMB_DISTAL_JOINTS[limb]) conf[is.frame][j] = 0;
  const full = clean(xy, conf, fps);
  const issues = hybrid ? sanityCheck(full, { collapseRatio: 0 }) : [...sanityCheck(full), ...w3.issues];
  const cl = hideImplausibleLimbs(clean(xy, conf, fps, { maxGapSeconds: 1.0 }), issues, fps);
  const period = full.length > fps * 2 ? findPeriod(full, fps) : null;
  const world: World = w3.world;
  const torso = median(torsoLengths(full));
  const contacts = detectContacts(full, fps, torso);
  const floor = fitFloor(full, contacts, { world, matQuad: opts.matQuad });
  const pinned = pinToFloor(full, contacts, floor, fps, { torso, world });
  const clHeld = holdLimbs(cl, fps, { maxSeconds: 2 }).xy; // Phase 13: short limb dropouts keep the last pose
  // feet: the raw foot points get the root-pinning offset the cleaned track already has; whole-body model scores
  // between 0.3 and 0.4 are its "not sure" band (two 30 px toe misses on the owner's 11-10 capture, none at 0.4)
  const footOpts = { pinOffset: pinned.offset, ...(hybrid ? { minVisibility: 0.4 } : {}) };
  const clPinned = clHeld.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + pinned.offset[i]] as [number, number]))));
  return {
    segment: seg,
    fps,
    xy: clPinned,
    xyFull: pinned.xy,
    contacts,
    floor,
    pinOffset: pinned.offset,
    worldClean: w3.world,
    depth: depthOrder(w3.world),
    issues,
    period,
    loop: period && period.periodic ? bestLoop(full, period.lag) : null,
    toes: feet(slice, clPinned, fps, 'toe', footOpts),
    heels: feet(slice, clPinned, fps, 'heel', footOpts),
    smallToes: hybrid ? feet(slice, clPinned, fps, 'smallToe', footOpts) : undefined,
    hands: hybrid ? hands(slice, clPinned, fps, { torso, pinOffset: pinned.offset }) : undefined,
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
