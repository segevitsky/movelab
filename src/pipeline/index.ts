export * from './types';
export * from './math';
export { clean, toTrack, torsoLengths, type CleanOptions } from './clean';
export { segment, sliceSegment, type SegmentOptions } from './segment';
export { sanityCheck, framesToRecheck, type SanityOptions } from './sanity';
export { findPeriod, bestLoop, normalise, repCount } from './reps';
export { feet, type FeetOptions } from './feet';
export { features, topJoints, jointAngle, poseDistance, JOINT_TRIPLES, type Features } from './features';
export { resample, estimateFps } from './resample';
export { contacts, footContact, type Contacts, type ContactPoint } from './contacts';
export { fitFloor, pinToFloor, floorYAt, type FloorLine } from './floor';
export { oneEuro } from './oneEuro';

import { clean, toTrack, torsoLengths } from './clean';
import { feet } from './feet';
import { features, type Features } from './features';
import { bestLoop, findPeriod } from './reps';
import { estimateFps } from './resample';
import { hideImplausibleLimbs, sanityCheck } from './sanity';
import { contacts as detectContacts, type Contacts } from './contacts';
import { fitFloor, pinToFloor, type FloorLine, type World } from './floor';
import { cleanWorld, LIMB_DISTAL_JOINTS } from './bones3d';
import { depthOrder, type DepthOrder } from './depth';
import { median } from './math';
import { segment, sliceSegment, type SegmentOptions } from './segment';
import type { FootTrack, LoopResult, PeriodResult, RawPose, SanityIssue, Segment, Track } from './types';

export type ProcessedSegment = {
  segment: Segment;
  fps: number;
  /** cleaned joints for drawing: gaps > 0.5 s stay NaN (never drawn) */
  xy: Track;
  /** cleaned joints with every gap bridged — for reps / features / tagging */
  xyFull: Track;
  /** Phase 2.5: contacts, fitted floor, and the per-frame vertical root-pinning offset applied to xy/xyFull */
  contacts: Contacts;
  floor: FloorLine;
  pinOffset: number[];
  /** Phase 2.5: cleaned 3D world track (flag → mask → fill → smooth) and the depth order per limb pair */
  worldClean: World;
  depth: DepthOrder;
  issues: SanityIssue[];
  period: PeriodResult | null;
  loop: LoopResult | null;
  toes: FootTrack;
  heels: FootTrack;
  features: Features;
};

/** Whole pipeline for one capture: segment → clean → sanity → reps/loop → feet → features. */
export function processCapture(raw: RawPose, opts: { segment?: SegmentOptions; matQuad?: [number, number][] } = {}): ProcessedSegment[] {
  const fps = raw.fps && raw.fps > 0 ? raw.fps : estimateFps(raw.frames);
  return segment(raw.frames, opts.segment).map((seg) => {
    const frames = sliceSegment(raw.frames, seg);
    const { xy, conf } = toTrack(frames);
    // Phase 2.5 step 4: 3D bone-length check first — flagged limb-frames become unknown in 2D too (→ gap fill)
    const rawWorld: World = frames.map((f) => (f.w && f.w.length === 33 ? f.w : undefined));
    const w3 = cleanWorld(rawWorld, fps);
    for (const is of w3.issues) for (const limb of is.limbs) for (const j of LIMB_DISTAL_JOINTS[limb]) conf[is.frame][j] = 0;
    const full = clean(xy, conf, fps);
    const issues = [...sanityCheck(full), ...w3.issues];
    const cl = hideImplausibleLimbs(clean(xy, conf, fps, { maxGapSeconds: 1.0 }), issues, fps);
    const period = findPeriod(full, fps);
    const world: World = w3.world;
    const torso = median(torsoLengths(full));
    const contacts = detectContacts(full, fps, torso);
    const floor = fitFloor(full, contacts, { world, matQuad: opts.matQuad });
    const pinned = pinToFloor(full, contacts, floor, fps, { torso, world });
    const clPinned: Track = cl.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + pinned.offset[i]] as [number, number]))));
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
      toes: feet(frames, clPinned, fps, 'toe'),
      heels: feet(frames, clPinned, fps, 'heel'),
      features: features(full, fps),
    };
  });
}
